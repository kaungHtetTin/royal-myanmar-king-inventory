<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PermissionName;
use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\Region;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\CustomerAccess;
use App\Services\DocumentReferenceGenerator;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CustomerController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly CustomerAccess $customerAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly WarehouseAccess $warehouseAccess,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Customer::class);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'type' => ['nullable', 'string', 'max:100'],
            'credit' => ['nullable', Rule::in(['allowed', 'cash_only'])],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'sort' => ['nullable', Rule::in(['code', 'name', 'customer_type', 'credit_limit', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        if (isset($data['warehouse_id'])) {
            abort_unless($this->warehouseAccess->allows($request->user(), $data['warehouse_id']), 403);
        }

        $query = $this->customerAccess->scope(Customer::query(), $request->user())
            ->with(['warehouse:id,code,name', 'assignedRegion.warehouse:id,code,name'])
            ->when($data['search'] ?? null, function ($query, string $search): void {
                $query->where(fn ($builder) => $builder
                    ->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('region', 'like', "%{$search}%")
                    ->orWhere('township', 'like', "%{$search}%"));
            })
            ->when($data['status'] ?? null, fn ($query, string $status) => $query->where('is_active', $status === 'active'))
            ->when($data['type'] ?? null, fn ($query, string $type) => $query->where('customer_type', $type))
            ->when($data['credit'] ?? null, fn ($query, string $credit) => $query->where('credit_allowed', $credit === 'allowed'))
            ->when($data['warehouse_id'] ?? null, fn ($query, int $warehouseId) => $query->where('warehouse_id', $warehouseId))
            ->when($data['region_id'] ?? null, fn ($query, int $regionId) => $query->where('region_id', $regionId))
            ->orderBy($data['sort'] ?? 'name', $data['direction'] ?? 'asc');

        $summaryQuery = clone $query;
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'active' => (clone $summaryQuery)->where('is_active', true)->count(),
            'credit_enabled' => (clone $summaryQuery)->where('credit_allowed', true)->count(),
            'credit_limit' => (int) (clone $summaryQuery)->where('credit_allowed', true)->sum('credit_limit'),
        ];

        return CustomerResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function options(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', Customer::class);

        return response()->json([
            'types' => $this->customerAccess->scope(Customer::query(), $request->user())
                ->whereNotNull('customer_type')->distinct()->orderBy('customer_type')->pluck('customer_type'),
            'warehouses' => $this->warehouseAccess->scope(Warehouse::query(), $request->user())
                ->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'regions' => Region::query()->where('is_active', true)->whereIn('warehouse_id', $this->warehouseAccess->scope(Warehouse::query(), $request->user())->select('id'))
                ->orderBy('name')->get(['id', 'warehouse_id', 'name']),
        ]);
    }

    public function show(Customer $customer): CustomerResource
    {
        Gate::authorize('view', $customer);

        return new CustomerResource($customer->load(['warehouse:id,code,name', 'assignedRegion.warehouse:id,code,name']));
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Customer::class);
        $request->merge($this->prepared($request));
        $this->prepareRegion($request);
        $data = $request->validate($this->rules());
        abort_unless($this->warehouseAccess->allows($request->user(), $data['warehouse_id']), 403);
        $this->validateActiveWarehouse($data['warehouse_id']);

        if (($data['credit_allowed'] || $data['credit_limit'] > 0) && ! $request->user()->can(PermissionName::CustomerCreditManage->value)) {
            abort(403);
        }

        $customer = DB::transaction(function () use ($request, $data): Customer {
            $data['code'] = $this->references->next('customer', 'CUS');
            $customer = Customer::query()->create($data);
            $this->auditLogger->record($request, 'customer.created', $request->user(), $customer, ['new' => $customer->toArray()]);
            if ($customer->credit_allowed || $customer->credit_limit > 0) {
                $this->auditCredit($request, $customer, ['credit_allowed' => false, 'credit_limit' => 0]);
            }

            return $customer;
        });

        return (new CustomerResource($customer->load(['warehouse:id,code,name', 'assignedRegion.warehouse:id,code,name'])))->response()->setStatusCode(201);
    }

    public function update(Request $request, Customer $customer): CustomerResource
    {
        Gate::authorize('update', $customer);
        $request->merge($this->prepared($request));
        $this->prepareRegion($request, $customer);
        $data = $request->validate($this->rules($customer));
        abort_unless($this->warehouseAccess->allows($request->user(), $data['warehouse_id']), 403);
        if ((int) $data['warehouse_id'] !== $customer->warehouse_id) {
            $this->validateActiveWarehouse($data['warehouse_id']);
        }

        DB::transaction(function () use ($request, $customer, $data): void {
            $customer = Customer::query()->lockForUpdate()->findOrFail($customer->id);
            $old = $customer->only(array_keys($data));
            $oldCredit = $customer->only(['credit_allowed', 'credit_limit']);
            $creditChanged = (bool) $data['credit_allowed'] !== $customer->credit_allowed || (int) $data['credit_limit'] !== $customer->credit_limit;
            if ($creditChanged) {
                Gate::authorize('manageCredit', $customer);
            }
            $customer->update($data);
            $this->auditLogger->record($request, 'customer.updated', $request->user(), $customer, ['old' => $old, 'new' => $customer->only(array_keys($old))]);
            if ($creditChanged) {
                $this->auditCredit($request, $customer, $oldCredit);
            }
        });

        return new CustomerResource($customer->refresh()->load(['warehouse:id,code,name', 'assignedRegion.warehouse:id,code,name']));
    }

    public function updateCredit(Request $request, Customer $customer): CustomerResource
    {
        Gate::authorize('manageCredit', $customer);
        $data = $request->validate([
            'credit_allowed' => ['required', 'boolean'],
            'credit_limit' => ['required', 'integer', 'min:0', 'max:999999999999999'],
        ]);
        DB::transaction(function () use ($request, $customer, $data): void {
            $customer = Customer::query()->lockForUpdate()->findOrFail($customer->id);
            $oldCredit = $customer->only(['credit_allowed', 'credit_limit']);
            $customer->update($data);
            $this->auditCredit($request, $customer, $oldCredit);
        });

        return new CustomerResource($customer->refresh()->load('warehouse:id,code,name'));
    }

    /** @return array<string, mixed> */
    private function rules(?Customer $customer = null): array
    {
        return [
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'region_id' => ['required', 'integer', Rule::exists('regions', 'id')->where('is_active', true)],
            'code' => $customer
                ? ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9_-]+$/', Rule::unique('customers', 'code')->ignore($customer)]
                : ['nullable'],
            'name' => ['required', 'string', 'max:255'],
            'customer_type' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:50'],
            'region' => ['nullable', 'string', 'max:100'],
            'township' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string', 'max:500'],
            'credit_allowed' => ['required', 'boolean'],
            'credit_limit' => ['required', 'integer', 'min:0', 'max:999999999999999'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    /** @return array<string, mixed> */
    private function prepared(Request $request): array
    {
        $prepared = ['code' => strtoupper(trim($request->string('code')->toString()))];
        foreach (['name', 'customer_type', 'phone', 'region', 'township', 'address', 'notes'] as $field) {
            if ($request->exists($field)) {
                $prepared[$field] = trim($request->string($field)->toString()) ?: null;
            }
        }

        return $prepared;
    }

    /** @param array<string, mixed> $old */
    private function auditCredit(Request $request, Customer $customer, array $old): void
    {
        $this->auditLogger->record($request, 'customer.credit_updated', $request->user(), $customer, [
            'old' => $old,
            'new' => $customer->only(['credit_allowed', 'credit_limit']),
        ]);
    }

    private function validateActiveWarehouse(int $warehouseId): void
    {
        if (! Warehouse::query()->whereKey($warehouseId)->where('is_active', true)->exists()) {
            throw ValidationException::withMessages([
                'warehouse_id' => ['The operating warehouse must be active.'],
            ]);
        }
    }

    private function prepareRegion(Request $request, ?Customer $customer = null): void
    {
        $region = null;
        if ($request->filled('region_id')) {
            $region = Region::query()->find($request->integer('region_id'));
        } elseif ($customer?->region_id) {
            $region = $customer->assignedRegion;
        } elseif ($request->filled('warehouse_id')) {
            $region = Region::query()->where('warehouse_id', $request->integer('warehouse_id'))
                ->where('is_active', true)->orderBy('id')->first();
        }
        if ($region) {
            $request->merge([
                'region_id' => $region->id,
                'warehouse_id' => $region->warehouse_id,
                'region' => $region->name,
            ]);
        }
    }
}
