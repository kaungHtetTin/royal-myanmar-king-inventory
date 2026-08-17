<?php

namespace App\Services;

use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Builder;

class WarehouseAccess
{
    public function allows(User $user, Warehouse|int $warehouse): bool
    {
        if (! $user->is_active) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        $warehouseId = $warehouse instanceof Warehouse ? $warehouse->getKey() : $warehouse;

        return $user->warehouses()->whereKey($warehouseId)->exists();
    }

    /** @param Builder<Warehouse> $query */
    public function scope(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        return $query->whereHas('users', fn (Builder $builder) => $builder->whereKey($user->getKey()));
    }
}
