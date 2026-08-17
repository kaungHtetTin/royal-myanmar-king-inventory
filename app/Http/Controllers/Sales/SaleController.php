<?php

namespace App\Http\Controllers\Sales;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\Product;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\IdempotencyService;
use App\Services\SalePostingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SaleController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly DocumentReferenceGenerator $references,
        private readonly IdempotencyService $idempotency,
        private readonly SalePostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::enum(SaleStatus::class)],
            'payment_type' => ['nullable', Rule::enum(PaymentType::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $representative = $this->representative($request);
        $query = Sale::query()->with($this->relations())->withSum('items as total_quantity', 'quantity')
            ->where('sales_representative_id', $representative->id)
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['payment_type'] ?? null, fn ($query, $type) => $query->where('payment_type', $type))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('reference', 'like', "%{$search}%")->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"))))
            ->latest('id');

        return SaleResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function options(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $customers = Customer::query()->with('creditBalance')->where('warehouse_id', $representative->primary_warehouse_id)->where('is_active', true)->orderBy('name')->get()
            ->map(function (Customer $customer): array {
                $outstanding = (int) ($customer->creditBalance?->outstanding_amount ?? 0);

                return ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->name, 'credit_allowed' => $customer->credit_allowed, 'credit_limit' => $customer->credit_limit, 'outstanding_amount' => $outstanding, 'available_credit' => max(0, $customer->credit_limit - $outstanding)];
            });
        $products = RepresentativeInventory::query()->join('products', 'products.id', '=', 'representative_inventories.product_id')
            ->where('representative_inventories.sales_representative_id', $representative->id)->where('representative_inventories.quantity', '>', 0)->where('products.is_active', true)
            ->orderBy('products.name')->get(['products.id', 'products.sku', 'products.name', 'products.unit', 'products.selling_price', 'representative_inventories.quantity']);
        $cashHold = (int) RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount');

        return response()->json(['representative' => ['id' => $representative->id, 'code' => $representative->code, 'name' => $representative->name], 'customers' => $customers, 'products' => $products, 'cash_hold' => $cashHold]);
    }

    public function store(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $data = $request->validate($this->rules());
        $result = $this->idempotency->execute($request->user(), 'sale:create', $this->idempotencyKey($request), function () use ($request, $representative, $data): array {
            [$customer, $items, $total] = $this->preparedDraft($representative, $data);
            $sale = Sale::query()->create(['reference' => $this->references->next('sale', 'SAL'), 'sales_representative_id' => $representative->id, 'warehouse_id' => $representative->primary_warehouse_id, 'customer_id' => $customer->id, 'payment_type' => $data['payment_type'], 'total_amount' => $total, 'status' => SaleStatus::Draft, 'notes' => $data['notes'] ?? null, 'created_by' => $request->user()->id]);
            $sale->items()->createMany($items);
            $this->auditLogger->record($request, 'sale.created', $request->user(), $sale, ['new' => $data, 'server_total' => $total]);

            return ['id' => $sale->id];
        });
        $sale = Sale::query()->findOrFail($result['id']);

        return (new SaleResource($this->load($sale)))->response()->setStatusCode(201);
    }

    public function update(Request $request, Sale $sale): SaleResource
    {
        $representative = $this->representative($request);
        $this->assertOwn($sale, $representative);
        $data = $request->validate($this->rules());
        [$customer, $items, $total] = $this->preparedDraft($representative, $data);
        DB::transaction(function () use ($request, $sale, $customer, $data, $items, $total): void {
            $sale = Sale::query()->lockForUpdate()->findOrFail($sale->id);
            if ($sale->status !== SaleStatus::Draft) {
                throw new DomainConflictException('Posted sales are immutable.', 'INVALID_DOCUMENT_STATE');
            }
            $old = $sale->load('items')->toArray();
            $sale->update(['customer_id' => $customer->id, 'payment_type' => $data['payment_type'], 'total_amount' => $total, 'notes' => $data['notes'] ?? null]);
            $sale->items()->delete();
            $sale->items()->createMany($items);
            $this->auditLogger->record($request, 'sale.updated', $request->user(), $sale, ['old' => $old, 'new' => $data, 'server_total' => $total]);
        });

        return new SaleResource($this->load($sale));
    }

    public function post(Request $request, Sale $sale): SaleResource
    {
        $representative = $this->representative($request);
        $this->assertOwn($sale, $representative);
        $this->posting->post($sale, $request->user(), $this->idempotencyKey($request), $request);

        return new SaleResource($this->load($sale));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return ['customer_id' => ['required', 'integer', 'exists:customers,id'], 'payment_type' => ['required', Rule::enum(PaymentType::class)], 'notes' => ['nullable', 'string', 'max:2000'], 'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'], 'items.*.quantity' => ['required', 'integer', 'min:1', 'max:100']];
    }

    /** @param array<string, mixed> $data
     * @return array{Customer, list<array<string, int>>, int}
     */
    private function preparedDraft(SalesRepresentative $representative, array $data): array
    {
        $customer = Customer::query()->whereKey($data['customer_id'])->where('warehouse_id', $representative->primary_warehouse_id)->where('is_active', true)->firstOrFail();
        $products = Product::query()->whereIn('id', collect($data['items'])->pluck('product_id'))->where('is_active', true)->get()->keyBy('id');
        if ($products->count() !== count($data['items'])) {
            throw ValidationException::withMessages(['items' => ['Every sale product must be active and available for selection.']]);
        }
        $items = collect($data['items'])->map(function (array $item) use ($products): array {
            $price = (int) $products->get($item['product_id'])->selling_price;

            return ['product_id' => (int) $item['product_id'], 'quantity' => (int) $item['quantity'], 'unit_price' => $price, 'line_total' => $price * (int) $item['quantity']];
        })->all();

        return [$customer, $items, (int) collect($items)->sum('line_total')];
    }

    private function representative(Request $request): SalesRepresentative
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);

        return $representative;
    }

    private function assertOwn(Sale $sale, SalesRepresentative $representative): void
    {
        abort_unless($sale->sales_representative_id === $representative->id, 403);
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['representative', 'warehouse', 'customer', 'items.product', 'creator', 'poster', 'voider'];
    }

    private function load(Sale $sale): Sale
    {
        return $sale->fresh($this->relations());
    }
}
