<?php

namespace App\Services;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class RepresentativeAccess
{
    public function __construct(private readonly WarehouseAccess $warehouseAccess) {}

    public function allows(User $user, SalesRepresentative $representative): bool
    {
        if (! $user->is_active) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($user->hasRole(RoleName::SalesRepresentative->value)) {
            return $representative->user_id === $user->id;
        }

        return $user->can(PermissionName::RepresentativeView->value)
            && $this->warehouseAccess->allows($user, $representative->primary_warehouse_id);
    }

    /** @param Builder<SalesRepresentative> $query */
    public function scope(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        if ($user->hasRole(RoleName::SalesRepresentative->value)) {
            return $query->where('user_id', $user->id);
        }

        $warehouseIds = $user->warehouses()->select('warehouses.id');

        return $query->whereIn('primary_warehouse_id', $warehouseIds);
    }
}
