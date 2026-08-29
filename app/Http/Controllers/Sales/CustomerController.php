<?php

namespace App\Http\Controllers\Sales;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\SalesRepresentative;
use App\Models\Way;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function __construct(
        private readonly DocumentReferenceGenerator $references,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);
        $customers = Customer::query()->with('way.region.warehouse:id,code,name')
            ->whereHas('way', fn ($way) => $way->whereIn('region_id', $representative->regions()->select('regions.id')))
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
            'region' => ['nullable', 'string', 'max:100'],
            'township' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string', 'max:500'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'way_id' => ['nullable', 'integer', 'exists:ways,id'],
        ]);
        $data = collect($data)->map(fn ($value) => is_string($value) ? (trim($value) ?: null) : $value)->all();
        $way = Way::query()->with('region')->whereKey($data['way_id'] ?? null)
            ->whereIn('region_id', $representative->regions()->select('regions.id'))->where('is_active', true)->first()
            ?? Way::query()->with('region')->whereIn('region_id', $representative->regions()->select('regions.id'))->where('is_active', true)->orderBy('id')->firstOrFail();

        $customer = DB::transaction(function () use ($request, $data, $way): Customer {
            $customer = Customer::query()->create(array_merge($data, [
                'warehouse_id' => $way->region->warehouse_id,
                'way_id' => $way->id,
                'region' => $way->region->name,
                'township' => $way->name,
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
            'id', 'code', 'name', 'customer_type', 'phone', 'region', 'township', 'way_id', 'address', 'notes', 'is_active',
            'credit_allowed', 'credit_limit', 'created_at',
        ]) + ['way' => $customer->way ? [
            'id' => $customer->way->id,
            'code' => $customer->way->code,
            'name' => $customer->way->name,
            'region' => $customer->way->region ? [
                ...$customer->way->region->only(['id', 'name', 'warehouse_id']),
                'warehouse' => $customer->way->region->warehouse?->only(['id', 'code', 'name']),
            ] : null,
        ] : null];
    }
}
