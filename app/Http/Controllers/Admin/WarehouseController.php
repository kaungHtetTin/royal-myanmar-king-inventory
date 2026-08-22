<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\WarehouseResource;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class WarehouseController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly WarehouseAccess $warehouseAccess,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Warehouse::class);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'sort' => ['nullable', Rule::in(['code', 'name', 'region', 'township', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = $this->warehouseAccess->scope(Warehouse::query(), $request->user())
            ->withCount('users')
            ->when($data['search'] ?? null, function ($query, string $search): void {
                $query->where(fn ($builder) => $builder
                    ->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('region', 'like', "%{$search}%")
                    ->orWhere('township', 'like', "%{$search}%"));
            })
            ->when($data['status'] ?? null, fn ($query, string $status) => $query->where('is_active', $status === 'active'))
            ->orderBy($data['sort'] ?? 'name', $data['direction'] ?? 'asc');

        $summaryQuery = clone $query;
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'active' => (clone $summaryQuery)->where('is_active', true)->count(),
            'inactive' => (clone $summaryQuery)->where('is_active', false)->count(),
            'assigned_users' => (int) (clone $summaryQuery)->get()->sum('users_count'),
        ];

        return WarehouseResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Warehouse::class);
        $request->merge(['code' => strtoupper($request->string('code')->toString())]);
        $data = $request->validate($this->rules());
        $warehouse = Warehouse::query()->create($this->normalized($data));
        $this->auditLogger->record($request, 'warehouse.created', $request->user(), $warehouse, ['new' => $warehouse->toArray()]);

        return (new WarehouseResource($warehouse->loadCount('users')))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, Warehouse $warehouse): WarehouseResource
    {
        Gate::authorize('update', $warehouse);
        $request->merge(['code' => strtoupper($request->string('code')->toString())]);
        $data = $request->validate($this->rules($warehouse));
        $old = $warehouse->only(array_keys($this->normalized($data)));
        $warehouse->update($this->normalized($data));
        $this->auditLogger->record($request, 'warehouse.updated', $request->user(), $warehouse, [
            'old' => $old,
            'new' => $warehouse->only(array_keys($old)),
        ]);

        return new WarehouseResource($warehouse->loadCount('users'));
    }

    /** @return array<string, mixed> */
    private function rules(?Warehouse $warehouse = null): array
    {
        return [
            'code' => ['required', 'string', 'max:30', 'regex:/^[a-zA-Z0-9_-]+$/', Rule::unique('warehouses', 'code')->ignore($warehouse)],
            'name' => ['required', 'string', 'max:255'],
            'region' => ['nullable', 'string', 'max:100'],
            'township' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string', 'max:500'],
            'phone' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalized(array $data): array
    {
        $data['code'] = strtoupper($data['code']);

        return $data;
    }
}
