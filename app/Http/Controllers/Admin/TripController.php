<?php

namespace App\Http\Controllers\Admin;

use App\Enums\TripStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\TripResource;
use App\Models\Region;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\SalesRepresentative;
use App\Models\Trip;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\TripWorkflowService;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class TripController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly WarehouseAccess $warehouseAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly TripWorkflowService $workflow,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $dateToRules = ['nullable', 'date'];
        if ($request->filled('date_from')) {
            $dateToRules[] = 'after_or_equal:date_from';
        }
        $data = $request->validate([
            'status' => ['nullable', Rule::enum(TripStatus::class)],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => $dateToRules,
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseIds($request);
        $query = Trip::query()->with($this->summaryRelations())->whereIn('warehouse_id', $warehouseIds)
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))
            ->when($data['region_id'] ?? null, fn ($query, $id) => $query->where('region_id', $id))
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('reference', 'like', "%{$search}%")->orWhere('title', 'like', "%{$search}%")))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '<=', $date))
            ->latest('id');

        $summaryQuery = (clone $query)->reorder();
        $summary = [
            'total' => $summaryQuery->count(),
            'planning' => (clone $summaryQuery)->where('status', TripStatus::Planning)->count(),
            'operation' => (clone $summaryQuery)->where('status', TripStatus::Operation)->count(),
            'ending' => (clone $summaryQuery)->where('status', TripStatus::Ending)->count(),
        ];

        return TripResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())->additional(['summary' => $summary]);
    }

    public function options(Request $request): JsonResponse
    {
        $warehouseIds = $this->warehouseIds($request);

        return response()->json([
            'warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'regions' => Region::query()->whereIn('warehouse_id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(['id', 'warehouse_id', 'name']),
            'representatives' => SalesRepresentative::query()
                ->select(['id', 'code', 'name', 'primary_warehouse_id'])
                ->with('regions:id,name,warehouse_id')
                ->withExists(['trips as has_active_trip' => fn ($query) => $query->whereIn('status', [TripStatus::Planning, TripStatus::Operation, TripStatus::Ending])])
                ->whereIn('primary_warehouse_id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(),
            'vehicles' => Vehicle::query()
                ->where('is_active', true)
                ->whereNotIn('id', Trip::query()
                    ->select('vehicle_id')
                    ->whereIn('status', [TripStatus::Planning, TripStatus::Operation, TripStatus::Ending]))
                ->orderBy('vehicle_number')
                ->get(['id', 'vehicle_number', 'vehicle_type', 'brand', 'model', 'sales_representative_id']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'region_id' => ['required', 'integer', Rule::exists('regions', 'id')->where('is_active', true)],
            'sales_representative_id' => ['required', 'integer', Rule::exists('sales_representatives', 'id')->where('is_active', true)],
            'vehicle_id' => ['required', 'integer', Rule::exists('vehicles', 'id')->where('is_active', true)],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
        abort_unless($this->warehouseAccess->allows($request->user(), (int) $data['warehouse_id']), 403);
        $region = Region::query()->findOrFail($data['region_id']);
        $representative = SalesRepresentative::query()->with('regions:id')->findOrFail($data['sales_representative_id']);
        if ($region->warehouse_id !== (int) $data['warehouse_id']) {
            throw ValidationException::withMessages(['region_id' => ['The region must belong to the selected warehouse.']]);
        }
        if (! $representative->regions->contains('id', $region->id)) {
            throw ValidationException::withMessages(['sales_representative_id' => ['The representative must be assigned to the selected region.']]);
        }
        if ($representative->primary_warehouse_id !== (int) $data['warehouse_id']) {
            throw ValidationException::withMessages(['sales_representative_id' => ['The representative must belong to the selected warehouse.']]);
        }

        $trip = DB::transaction(function () use ($data, $representative, $request): Trip {
            SalesRepresentative::query()->lockForUpdate()->findOrFail($representative->id);
            $vehicle = Vehicle::query()->lockForUpdate()->findOrFail($data['vehicle_id']);
            if (Trip::query()->where('sales_representative_id', $representative->id)->whereIn('status', [TripStatus::Planning, TripStatus::Operation, TripStatus::Ending])->exists()) {
                throw new DomainConflictException('This representative already has an active trip.', 'REPRESENTATIVE_HAS_ACTIVE_TRIP');
            }
            if ($vehicle->sales_representative_id !== $representative->id) {
                throw ValidationException::withMessages(['vehicle_id' => ['Choose the vehicle assigned to this representative.']]);
            }
            if (Trip::query()->where('vehicle_id', $vehicle->id)->whereIn('status', [TripStatus::Planning, TripStatus::Operation, TripStatus::Ending])->exists()) {
                throw new DomainConflictException('This vehicle is already assigned to an active trip.', 'VEHICLE_HAS_ACTIVE_TRIP');
            }
            $stock = RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->get(['quantity', 'foc_quantity']);
            if ($stock->contains(fn ($row) => $row->quantity > 0 || $row->foc_quantity > 0)) {
                throw new DomainConflictException('Return the representative stock before creating a new trip.', 'REPRESENTATIVE_HAS_STOCK');
            }
            $trip = Trip::query()->create($data + [
                'reference' => $this->references->next('trip', 'TRP'),
                'status' => TripStatus::Planning,
                'opening_cash_balance' => (int) RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount'),
                'created_by' => $request->user()->id,
            ]);
            $this->auditLogger->record($request, 'trip.created', $request->user(), $trip, ['new' => $data]);

            return $trip;
        });

        return (new TripResource($this->load($trip)))->response()->setStatusCode(201);
    }

    public function show(Request $request, Trip $trip): TripResource
    {
        $this->assertScope($request, $trip);

        return new TripResource($this->load($trip));
    }

    public function start(Request $request, Trip $trip): TripResource
    {
        $this->assertScope($request, $trip);

        return new TripResource($this->load($this->workflow->start($trip, $request->user(), $request)));
    }

    public function beginEnding(Request $request, Trip $trip): TripResource
    {
        $this->assertScope($request, $trip);

        return new TripResource($this->load($this->workflow->beginEnding($trip, $request->user(), $request)));
    }

    public function complete(Request $request, Trip $trip): TripResource
    {
        $this->assertScope($request, $trip);
        $data = $request->validate(['notes' => ['nullable', 'string', 'max:1000']]);

        return new TripResource($this->load($this->workflow->complete($trip, $request->user(), $data['notes'] ?? null, $request)));
    }

    public function cancel(Request $request, Trip $trip): TripResource
    {
        $this->assertScope($request, $trip);

        return new TripResource($this->load($this->workflow->cancel($trip, $request->user(), $this->commandReason($request), $request)));
    }

    private function assertScope(Request $request, Trip $trip): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $trip->warehouse_id), 403);
    }

    private function warehouseIds(Request $request)
    {
        return $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
    }

    private function summaryRelations(): array
    {
        return ['warehouse', 'region', 'representative', 'vehicle', 'creator', 'starter', 'endingActor', 'completer', 'canceller'];
    }

    private function detailRelations(): array
    {
        return [...$this->summaryRelations(), 'transfers.sourceWarehouse', 'transfers.representative', 'transfers.items.product.baseUnit', 'transfers.items.product.defaultSellingUnit', 'transfers.items.unit', 'transfers.items.focUnit', 'transfers.transit', 'transfers.creator', 'transfers.dispatcher', 'transfers.receiver', 'transfers.canceller', 'transfers.reverser', 'sales.representative', 'sales.warehouse', 'sales.region', 'sales.customer', 'sales.items.product.baseUnit', 'sales.items.product.defaultSellingUnit', 'sales.items.product.units', 'sales.items.unit', 'sales.items.focUnit', 'sales.creator', 'sales.poster', 'sales.voider', 'expenses.creator', 'cashSubmissions.representative', 'cashSubmissions.warehouse', 'cashSubmissions.creator', 'cashSubmissions.confirmer', 'cashSubmissions.canceller', 'cashSubmissions.reverser', 'customerPayments.representative', 'customerPayments.warehouse', 'customerPayments.customer', 'customerPayments.receiver', 'customerPayments.creator', 'customerPayments.poster', 'customerPayments.voider'];
    }

    private function load(Trip $trip): Trip
    {
        return $trip->fresh($this->detailRelations());
    }
}
