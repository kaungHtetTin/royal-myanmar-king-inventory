<?php

namespace App\Http\Controllers\Admin;

use App\Enums\CustomerPaymentStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerCreditBalanceResource;
use App\Http\Resources\CustomerPaymentResource;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\CustomerPaymentPostingService;
use App\Services\DocumentReferenceGenerator;
use App\Services\IdempotencyService;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CustomerPaymentController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly WarehouseAccess $warehouseAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly IdempotencyService $idempotency,
        private readonly CustomerPaymentPostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function balances(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'search' => ['nullable', 'string', 'max:100'], 'owing_only' => ['nullable', 'boolean'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $warehouseIds = $this->warehouseIds($request, $data['warehouse_id'] ?? null);
        $query = Customer::query()->with(['warehouse:id,code,name', 'creditBalance'])->whereIn('warehouse_id', $warehouseIds)
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")))
            ->when($data['owing_only'] ?? true, fn ($query) => $query->whereHas('creditBalance', fn ($balance) => $balance->where('outstanding_amount', '>', 0)))->orderBy('name');

        $summary = [
            'outstanding' => (int) (clone $query)->get()->sum(fn ($customer) => $customer->creditBalance?->outstanding_amount ?? 0),
        ];

        return CustomerCreditBalanceResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function options(Request $request): JsonResponse
    {
        $warehouseIds = $this->warehouseIds($request, null);
        $customers = Customer::query()->with('creditBalance')->whereIn('warehouse_id', $warehouseIds)->whereHas('creditBalance', fn ($query) => $query->where('outstanding_amount', '>', 0))->orderBy('name')->get()->map(fn (Customer $customer) => ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->name, 'warehouse_id' => $customer->warehouse_id, 'outstanding_amount' => (int) $customer->creditBalance->outstanding_amount]);
        $warehouses = Warehouse::query()->whereIn('id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name']);

        return response()->json(['customers' => $customers, 'warehouses' => $warehouses, 'payment_methods' => ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'other']]);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'status' => ['nullable', Rule::enum(CustomerPaymentStatus::class)], 'search' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $warehouseIds = $this->warehouseIds($request, $data['warehouse_id'] ?? null);
        $query = CustomerPayment::query()->with($this->relations())->whereIn('warehouse_id', $warehouseIds)->when($data['customer_id'] ?? null, fn ($query, $id) => $query->where('customer_id', $id))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('reference', 'like', "%{$search}%")->orWhere('payment_reference', 'like', "%{$search}%")))->latest('id');

        $summary = [
            'draft_amount' => (int) (clone $query)->where('status', CustomerPaymentStatus::Draft)->sum('amount'),
        ];

        return CustomerPaymentResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $customer = $this->customerInScope($request, (int) $data['customer_id']);
        $result = $this->idempotency->execute($request->user(), 'customer-payment:create', $this->idempotencyKey($request), function () use ($request, $customer, $data): array {
            $payment = CustomerPayment::query()->create(['reference' => $this->references->next('customer_payment', 'PAY'), 'warehouse_id' => $customer->warehouse_id, 'customer_id' => $customer->id, 'amount' => $data['amount'], 'payment_date' => $data['payment_date'], 'payment_method' => $data['payment_method'], 'payment_reference' => $data['payment_reference'] ?? null, 'notes' => $data['notes'] ?? null, 'status' => CustomerPaymentStatus::Draft, 'received_by' => $request->user()->id, 'created_by' => $request->user()->id]);
            $this->auditLogger->record($request, 'customer_payment.created', $request->user(), $payment, ['new' => $payment->toArray()]);

            return ['id' => $payment->id];
        });

        return (new CustomerPaymentResource(CustomerPayment::query()->with($this->relations())->findOrFail($result['id'])))->response()->setStatusCode(201);
    }

    public function update(Request $request, CustomerPayment $customerPayment): CustomerPaymentResource
    {
        $this->authorizeScope($request, $customerPayment);
        $data = $request->validate($this->rules());
        $customer = $this->customerInScope($request, (int) $data['customer_id']);
        DB::transaction(function () use ($request, $customerPayment, $customer, $data): void {
            $payment = CustomerPayment::query()->lockForUpdate()->findOrFail($customerPayment->id);
            if ($payment->status !== CustomerPaymentStatus::Draft) {
                throw new DomainConflictException('Posted customer payments are immutable.', 'INVALID_DOCUMENT_STATE');
            }
            $old = $payment->toArray();
            $payment->update(['warehouse_id' => $customer->warehouse_id, 'customer_id' => $customer->id, 'amount' => $data['amount'], 'payment_date' => $data['payment_date'], 'payment_method' => $data['payment_method'], 'payment_reference' => $data['payment_reference'] ?? null, 'notes' => $data['notes'] ?? null]);
            $this->auditLogger->record($request, 'customer_payment.updated', $request->user(), $payment, ['old' => $old, 'new' => $payment->toArray()]);
        });

        return new CustomerPaymentResource($customerPayment->fresh($this->relations()));
    }

    public function post(Request $request, CustomerPayment $customerPayment): CustomerPaymentResource
    {
        $this->authorizeScope($request, $customerPayment);
        $this->posting->post($customerPayment, $request->user(), $this->idempotencyKey($request), $request);

        return new CustomerPaymentResource($customerPayment->fresh($this->relations()));
    }

    public function void(Request $request, CustomerPayment $customerPayment): CustomerPaymentResource
    {
        $this->authorizeScope($request, $customerPayment);
        $this->posting->void($customerPayment, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new CustomerPaymentResource($customerPayment->fresh($this->relations()));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return ['customer_id' => ['required', 'integer', 'exists:customers,id'], 'amount' => ['required', 'integer', 'min:1', 'max:999999999999999'], 'payment_date' => ['required', 'date'], 'payment_method' => ['required', 'string', 'max:100'], 'payment_reference' => ['nullable', 'string', 'max:100'], 'notes' => ['nullable', 'string', 'max:2000']];
    }

    private function customerInScope(Request $request, int $id): Customer
    {
        $customer = Customer::query()->findOrFail($id);
        abort_unless($this->warehouseAccess->allows($request->user(), $customer->warehouse_id), 403);

        return $customer;
    }

    private function authorizeScope(Request $request, CustomerPayment $payment): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $payment->warehouse_id), 403);
    }

    private function warehouseIds(Request $request, ?int $warehouseId)
    {
        $ids = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if ($warehouseId !== null && ! $ids->contains($warehouseId)) {
            abort(403);
        }

        return $warehouseId === null ? $ids : collect([$warehouseId]);
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['warehouse', 'customer', 'receiver', 'creator', 'poster', 'voider'];
    }
}
