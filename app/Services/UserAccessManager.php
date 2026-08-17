<?php

namespace App\Services;

use App\Enums\RoleName;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;

class UserAccessManager
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly WarehouseAccess $warehouseAccess,
    ) {}

    /** @param list<string> $roleNames @param list<int> $warehouseIds */
    public function sync(Request $request, User $actor, User $target, array $roleNames, array $warehouseIds): void
    {
        $this->validateRoles($actor, $target, $roleNames);
        $this->validateWarehouses($actor, $warehouseIds);

        $oldRoles = $target->getRoleNames()->values()->all();
        $oldWarehouses = $target->warehouses()->pluck('warehouses.id')->map(fn ($id) => (int) $id)->all();

        DB::transaction(function () use ($request, $actor, $target, $roleNames, $warehouseIds, $oldRoles, $oldWarehouses): void {
            $target->syncRoles($roleNames);
            $target->warehouses()->syncWithPivotValues($warehouseIds, ['assigned_by' => $actor->id]);

            $this->auditLogger->record($request, 'user.access_updated', $actor, $target, [
                'roles' => ['old' => $oldRoles, 'new' => $roleNames],
                'warehouse_ids' => ['old' => $oldWarehouses, 'new' => $warehouseIds],
            ]);
        });
    }

    /** @param list<string> $roleNames */
    private function validateRoles(User $actor, User $target, array $roleNames): void
    {
        $existing = Role::query()->where('guard_name', 'web')->whereIn('name', $roleNames)->pluck('name')->all();
        if (count($existing) !== count(array_unique($roleNames))) {
            throw ValidationException::withMessages(['roles' => ['One or more selected roles are invalid.']]);
        }

        $changesSuperAdmin = $target->hasRole(RoleName::SuperAdmin->value) !== in_array(RoleName::SuperAdmin->value, $roleNames, true);
        if ($changesSuperAdmin && ! $actor->isSuperAdmin()) {
            throw ValidationException::withMessages(['roles' => ['Only a Super Admin may change Super Admin membership.']]);
        }

        if ($actor->is($target) && $target->getRoleNames()->sort()->values()->all() !== collect($roleNames)->sort()->values()->all()) {
            throw ValidationException::withMessages(['roles' => ['You cannot change your own roles.']]);
        }

        if ($target->hasRole(RoleName::SuperAdmin->value)
            && ! in_array(RoleName::SuperAdmin->value, $roleNames, true)
            && User::role(RoleName::SuperAdmin->value)->count() <= 1) {
            throw ValidationException::withMessages(['roles' => ['The final Super Admin role cannot be removed.']]);
        }
    }

    /** @param list<int> $warehouseIds */
    private function validateWarehouses(User $actor, array $warehouseIds): void
    {
        if ($actor->isSuperAdmin()) {
            return;
        }

        if ($warehouseIds === []) {
            throw ValidationException::withMessages(['warehouse_ids' => ['At least one accessible warehouse is required.']]);
        }

        $allowed = $this->warehouseAccess
            ->scope(Warehouse::query(), $actor)
            ->whereIn('id', $warehouseIds)
            ->count();

        if ($allowed !== count(array_unique($warehouseIds))) {
            throw ValidationException::withMessages(['warehouse_ids' => ['A warehouse is outside your administration scope.']]);
        }
    }
}
