<?php

namespace App\Http\Controllers\Sales;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Region;
use App\Models\SalesRepresentative;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\PaymentMethodRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function __construct(
        private readonly DocumentReferenceGenerator $references,
        private readonly AuditLogger $auditLogger,
        private readonly PaymentMethodRegistry $paymentMethods,
    ) {}

    public function options(Request $request): JsonResponse
    {
        $representative = $this->representative($request);

        return response()->json([
            'regions' => $representative->regions()->with('warehouse:id,code,name')->where('regions.is_active', true)
                ->orderBy('regions.name')->get()->map(fn (Region $region) => [
                    ...$region->only(['id', 'name', 'warehouse_id']),
                    'warehouse' => $region->warehouse?->only(['id', 'code', 'name']),
                ])->values(),
            'payment_methods' => $this->paymentMethods->active(),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $regionIds = $representative->regions()->where('regions.is_active', true)->pluck('regions.id');
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $customers = Customer::query()->with(['assignedRegion.warehouse:id,code,name', 'creditBalance'])
            ->whereIn('region_id', $regionIds)
            ->when($data['search'] ?? null, fn ($query, string $search) => $query->where(
                fn ($scope) => $scope->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('township', 'like', "%{$search}%"),
            ))
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString();

        return response()->json([
            'data' => collect($customers->items())->map(fn (Customer $customer) => $this->customerData($customer)),
            'meta' => [
                'current_page' => $customers->currentPage(),
                'from' => $customers->firstItem(),
                'last_page' => $customers->lastPage(),
                'per_page' => $customers->perPage(),
                'to' => $customers->lastItem(),
                'total' => $customers->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'customer_type' => ['nullable', 'string', 'max:100'],
            'phone' => ['nullable', 'string', 'max:50'],
            'region_id' => ['required', 'integer', 'exists:regions,id'],
            'township' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string', 'max:500'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $data = collect($data)->map(fn ($value) => is_string($value) ? (trim($value) ?: null) : $value)->all();
        $region = $representative->regions()->whereKey($data['region_id'])->where('regions.is_active', true)->firstOrFail();

        $customer = DB::transaction(function () use ($request, $data, $region): Customer {
            $customer = Customer::query()->create(array_merge($data, [
                'warehouse_id' => $region->warehouse_id,
                'region_id' => $region->id,
                'region' => $region->name,
                'code' => $this->references->next('customer', 'CUS'),
                'credit_allowed' => false,
                'credit_limit' => 0,
                'is_active' => true,
            ]));
            $this->auditLogger->record($request, 'customer.created', $request->user(), $customer, [
                'new' => $customer->toArray(),
                'created_from' => 'sales_app',
            ]);

            return $customer;
        });

        return response()->json([
            'customer' => [
                'id' => $customer->id,
                'code' => $customer->code,
                'name' => $customer->name,
                'credit_allowed' => false,
                'credit_limit' => 0,
                'outstanding_amount' => 0,
                'available_credit' => 0,
            ],
        ], 201);
    }

    private function representative(Request $request): SalesRepresentative
    {
        return SalesRepresentative::query()
            ->where('user_id', $request->user()->id)
            ->where('is_active', true)
            ->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function customerData(Customer $customer): array
    {
        return $customer->only([
            'id', 'code', 'name', 'customer_type', 'phone', 'region_id', 'township', 'address', 'notes', 'is_active',
            'credit_allowed', 'credit_limit', 'created_at',
        ]) + [
            'outstanding_amount' => (int) ($customer->creditBalance?->outstanding_amount ?? 0),
            'available_credit' => max(0, $customer->credit_limit - (int) ($customer->creditBalance?->outstanding_amount ?? 0)),
            'region' => $customer->assignedRegion ? [
                ...$customer->assignedRegion->only(['id', 'name', 'warehouse_id']),
                'warehouse' => $customer->assignedRegion->warehouse?->only(['id', 'code', 'name']),
            ] : null,
        ];
    }
}
