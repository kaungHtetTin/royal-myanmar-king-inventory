<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\VehicleResource;
use App\Models\SalesRepresentative;
use App\Models\Vehicle;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class VehicleController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Vehicle::class);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'type' => ['nullable', 'string', 'max:50'],
            'assignment' => ['nullable', Rule::in(['assigned', 'unassigned'])],
            'sort' => ['nullable', Rule::in(['vehicle_number', 'vehicle_type', 'brand', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = Vehicle::query()
            ->with('representative:id,code,name')
            ->when($data['search'] ?? null, function ($query, string $search): void {
                $query->where(fn ($builder) => $builder
                    ->where('vehicle_number', 'like', "%{$search}%")
                    ->orWhere('vehicle_type', 'like', "%{$search}%")
                    ->orWhere('brand', 'like', "%{$search}%")
                    ->orWhere('model', 'like', "%{$search}%")
                    ->orWhereHas('representative', fn ($representative) => $representative
                        ->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%")));
            })
            ->when($data['status'] ?? null, fn ($query, string $status) => $query->where('is_active', $status === 'active'))
            ->when($data['type'] ?? null, fn ($query, string $type) => $query->where('vehicle_type', $type))
            ->when($data['assignment'] ?? null, fn ($query, string $assignment) => $assignment === 'assigned' ? $query->whereNotNull('sales_representative_id') : $query->whereNull('sales_representative_id'))
            ->orderBy($data['sort'] ?? 'vehicle_number', $data['direction'] ?? 'asc');

        $summaryQuery = clone $query;
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'active' => (clone $summaryQuery)->where('is_active', true)->count(),
            'assigned' => (clone $summaryQuery)->whereNotNull('sales_representative_id')->count(),
            'unassigned' => (clone $summaryQuery)->whereNull('sales_representative_id')->count(),
        ];

        return VehicleResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function options(): JsonResponse
    {
        Gate::authorize('viewAny', Vehicle::class);

        return response()->json([
            'types' => Vehicle::query()->distinct()->orderBy('vehicle_type')->pluck('vehicle_type'),
            'representatives' => SalesRepresentative::query()
                ->where('is_active', true)
                ->with('vehicle:id,sales_representative_id')
                ->orderBy('name')
                ->get(['id', 'code', 'name'])
                ->map(fn (SalesRepresentative $representative) => [
                    'id' => $representative->id,
                    'code' => $representative->code,
                    'name' => $representative->name,
                    'vehicle_id' => $representative->vehicle?->id,
                ]),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Vehicle::class);
        $request->merge($this->prepared($request));
        $data = $request->validate($this->rules());
        $vehicle = Vehicle::query()->create($data);
        $this->auditLogger->record($request, 'vehicle.created', $request->user(), $vehicle, ['new' => $vehicle->toArray()]);

        return (new VehicleResource($vehicle->load('representative:id,code,name')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Vehicle $vehicle): VehicleResource
    {
        Gate::authorize('update', $vehicle);
        $request->merge($this->prepared($request));
        $data = $request->validate($this->rules($vehicle));
        $old = $vehicle->only(array_keys($data));
        $vehicle->update($data);
        $this->auditLogger->record($request, 'vehicle.updated', $request->user(), $vehicle, [
            'old' => $old,
            'new' => $vehicle->only(array_keys($old)),
        ]);

        return new VehicleResource($vehicle->load('representative:id,code,name'));
    }

    /** @return array<string, mixed> */
    private function rules(?Vehicle $vehicle = null): array
    {
        return [
            'vehicle_number' => ['required', 'string', 'max:50', Rule::unique('vehicles', 'vehicle_number')->ignore($vehicle)],
            'vehicle_type' => ['required', 'string', 'max:50'],
            'brand' => ['nullable', 'string', 'max:100'],
            'model' => ['nullable', 'string', 'max:100'],
            'sales_representative_id' => [
                'nullable', 'integer',
                Rule::exists('sales_representatives', 'id')->where('is_active', true),
                Rule::unique('vehicles', 'sales_representative_id')->ignore($vehicle),
            ],
            'is_active' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /** @return array<string, mixed> */
    private function prepared(Request $request): array
    {
        $prepared = ['vehicle_number' => strtoupper(trim($request->string('vehicle_number')->toString()))];
        foreach (['vehicle_type', 'brand', 'model', 'notes'] as $field) {
            if ($request->exists($field)) {
                $prepared[$field] = trim($request->string($field)->toString()) ?: null;
            }
        }
        if ($request->exists('sales_representative_id')) {
            $prepared['sales_representative_id'] = $request->input('sales_representative_id') ?: null;
        }

        return $prepared;
    }
}
