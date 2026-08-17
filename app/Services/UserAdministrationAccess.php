<?php

namespace App\Services;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class UserAdministrationAccess
{
    public function allows(User $actor, User $target): bool
    {
        if (! $actor->is_active || ! $actor->can(PermissionName::UserManage->value)) {
            return false;
        }

        if ($actor->isSuperAdmin()) {
            return true;
        }

        if ($target->isSuperAdmin()) {
            return false;
        }

        return $target->warehouses()
            ->whereIn('warehouses.id', $actor->warehouses()->select('warehouses.id'))
            ->exists();
    }

    /** @param Builder<User> $query */
    public function scope(Builder $query, User $actor): Builder
    {
        if ($actor->isSuperAdmin()) {
            return $query;
        }

        return $query
            ->whereDoesntHave('roles', fn (Builder $builder) => $builder->where('name', RoleName::SuperAdmin->value))
            ->whereHas('warehouses', fn (Builder $builder) => $builder->whereIn(
                'warehouses.id',
                $actor->warehouses()->select('warehouses.id'),
            ));
    }
}
