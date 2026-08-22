<?php

namespace App\Http\Controllers\Admin;

use App\Enums\RoleName;
use App\Http\Controllers\Controller;
use App\Http\Resources\SalesRepresentativeResource;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\RepresentativeAccess;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SalesRepresentativeController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly RepresentativeAccess $representativeAccess,
        private readonly WarehouseAccess $warehouseAccess,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', SalesRepresentative::class);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'vehicle' => ['nullable', Rule::in(['assigned', 'unassigned'])],
            'sort' => ['nullable', Rule::in(['code', 'name', 'region', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        if (isset($data['warehouse_id'])) {
            abort_unless($this->warehouseAccess->allows($request->user(), $data['warehouse_id']), 403);
        }

        $query = $this->representativeAccess->scope(SalesRepresentative::query(), $request->user())
            ->with(['primaryWarehouse:id,code,name', 'user:id,username,email,is_active,last_login_at', 'vehicle:id,sales_representative_id,vehicle_number,vehicle_type'])
            ->when($data['search'] ?? null, function ($query, string $search): void {
                $query->where(fn ($builder) => $builder
                    ->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('region', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($user) => $user->where('username', 'like', "%{$search}%")));
            })
            ->when($data['status'] ?? null, fn ($query, string $status) => $query->where('is_active', $status === 'active'))
            ->when($data['warehouse_id'] ?? null, fn ($query, int $warehouseId) => $query->where('primary_warehouse_id', $warehouseId))
            ->when($data['vehicle'] ?? null, fn ($query, string $vehicle) => $vehicle === 'assigned' ? $query->whereHas('vehicle') : $query->whereDoesntHave('vehicle'))
            ->orderBy($data['sort'] ?? 'name', $data['direction'] ?? 'asc');

        return SalesRepresentativeResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function options(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', SalesRepresentative::class);

        return response()->json([
            'warehouses' => $this->warehouseAccess->scope(Warehouse::query(), $request->user())
                ->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'vehicles' => Vehicle::query()->where('is_active', true)->orderBy('vehicle_number')
                ->get(['id', 'vehicle_number', 'vehicle_type', 'sales_representative_id']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', SalesRepresentative::class);
        $request->merge($this->prepared($request));
        $data = $request->validate($this->rules());
        $this->validateScopeAndVehicle($request, $data);

        $representative = DB::transaction(function () use ($request, $data): SalesRepresentative {
            $user = User::query()->create([
                'name' => $data['name'],
                'username' => $data['username'],
                'email' => $data['email'],
                'password' => $data['password'],
                'is_active' => $data['is_active'],
                'deactivated_at' => $data['is_active'] ? null : now(),
            ]);
            $user->assignRole(RoleName::SalesRepresentative->value);
            $user->warehouses()->syncWithPivotValues([$data['primary_warehouse_id']], ['assigned_by' => $request->user()->id]);

            $representative = SalesRepresentative::query()->create($this->profileData($data, $user->id));
            if ($data['vehicle_id']) {
                Vehicle::query()->whereKey($data['vehicle_id'])->update(['sales_representative_id' => $representative->id]);
            }
            $this->auditLogger->record($request, 'representative.created', $request->user(), $representative, [
                'new' => $this->auditData($representative, $user, $data['vehicle_id']),
            ]);

            return $representative;
        });

        return (new SalesRepresentativeResource($this->load($representative)))->response()->setStatusCode(201);
    }

    public function update(Request $request, SalesRepresentative $salesRepresentative): SalesRepresentativeResource
    {
        Gate::authorize('update', $salesRepresentative);
        $request->merge($this->prepared($request));
        $data = $request->validate($this->rules($salesRepresentative));
        $this->validateScopeAndVehicle($request, $data, $salesRepresentative);

        DB::transaction(function () use ($request, $data, $salesRepresentative): void {
            $user = $salesRepresentative->user;
            $oldVehicleId = $salesRepresentative->vehicle?->id;
            $old = $this->auditData($salesRepresentative, $user, $oldVehicleId);
            $user->fill([
                'name' => $data['name'],
                'username' => $data['username'],
                'email' => $data['email'],
                'is_active' => $data['is_active'],
                'deactivated_at' => $data['is_active'] ? null : ($user->deactivated_at ?? now()),
            ]);
            if (! empty($data['password'])) {
                $user->password = $data['password'];
            }
            $user->save();
            $user->syncRoles([RoleName::SalesRepresentative->value]);
            $user->warehouses()->syncWithPivotValues([$data['primary_warehouse_id']], ['assigned_by' => $request->user()->id]);
            $salesRepresentative->update($this->profileData($data, $user->id));

            if ($oldVehicleId !== $data['vehicle_id']) {
                Vehicle::query()->where('sales_representative_id', $salesRepresentative->id)->update(['sales_representative_id' => null]);
                if ($data['vehicle_id']) {
                    Vehicle::query()->whereKey($data['vehicle_id'])->update(['sales_representative_id' => $salesRepresentative->id]);
                }
            }
            $this->auditLogger->record($request, 'representative.updated', $request->user(), $salesRepresentative, [
                'old' => $old,
                'new' => $this->auditData($salesRepresentative->fresh(), $user->fresh(), $data['vehicle_id']),
            ]);
        });

        return new SalesRepresentativeResource($this->load($salesRepresentative->fresh()));
    }

    /** @return array<string, mixed> */
    private function rules(?SalesRepresentative $representative = null): array
    {
        $user = $representative?->user;

        return [
            'code' => ['required', 'string', 'max:30', 'regex:/^[a-zA-Z0-9_-]+$/', Rule::unique('sales_representatives', 'code')->ignore($representative)],
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user)],
            'username' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users', 'username')->ignore($user)],
            'password' => [$representative ? 'nullable' : 'required', 'string', 'size:8', 'confirmed'],
            'primary_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'region' => ['nullable', 'string', 'max:100'],
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    /** @param array<string, mixed> $data */
    private function validateScopeAndVehicle(Request $request, array $data, ?SalesRepresentative $representative = null): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $data['primary_warehouse_id']), 403);
        if ((int) $data['primary_warehouse_id'] !== $representative?->primary_warehouse_id
            && ! Warehouse::query()->whereKey($data['primary_warehouse_id'])->where('is_active', true)->exists()) {
            throw ValidationException::withMessages(['primary_warehouse_id' => ['The primary warehouse must be active.']]);
        }
        if (! $data['vehicle_id']) {
            return;
        }
        $vehicle = Vehicle::query()->findOrFail($data['vehicle_id']);
        if (! $vehicle->is_active || ($vehicle->sales_representative_id && $vehicle->sales_representative_id !== $representative?->id)) {
            throw ValidationException::withMessages(['vehicle_id' => ['This vehicle is inactive or assigned to another representative.']]);
        }
    }

    /** @return array<string, mixed> */
    private function prepared(Request $request): array
    {
        $prepared = [
            'code' => strtoupper(trim($request->string('code')->toString())),
            'username' => strtolower(trim($request->string('username')->toString())),
        ];
        foreach (['name', 'phone', 'email', 'region', 'notes'] as $field) {
            if ($request->exists($field)) {
                $value = trim($request->string($field)->toString());
                $prepared[$field] = $field === 'email' ? (strtolower($value) ?: null) : ($value ?: null);
            }
        }
        if ($request->exists('vehicle_id')) {
            $prepared['vehicle_id'] = $request->input('vehicle_id') ?: null;
        }

        return $prepared;
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function profileData(array $data, int $userId): array
    {
        return collect($data)->only(['code', 'name', 'phone', 'email', 'primary_warehouse_id', 'region', 'notes', 'is_active'])
            ->merge(['user_id' => $userId])->all();
    }

    private function load(SalesRepresentative $representative): SalesRepresentative
    {
        return $representative->load(['primaryWarehouse:id,code,name', 'user:id,username,email,is_active,last_login_at', 'vehicle:id,sales_representative_id,vehicle_number,vehicle_type']);
    }

    /** @return array<string, mixed> */
    private function auditData(SalesRepresentative $representative, User $user, ?int $vehicleId): array
    {
        return $representative->only(['code', 'name', 'phone', 'email', 'primary_warehouse_id', 'region', 'notes', 'is_active']) + [
            'username' => $user->username,
            'account_is_active' => $user->is_active,
            'vehicle_id' => $vehicleId,
        ];
    }
}
