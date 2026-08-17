<?php

namespace App\Policies;

use App\Enums\PermissionName;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\WarehouseAccess;

class WarehousePolicy
{
    public function __construct(private readonly WarehouseAccess $access) {}

    public function viewAny(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::WarehouseView->value);
    }

    public function view(User $user, Warehouse $warehouse): bool
    {
        return $user->can(PermissionName::WarehouseView->value) && $this->access->allows($user, $warehouse);
    }

    public function create(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::WarehouseCreate->value);
    }

    public function update(User $user, Warehouse $warehouse): bool
    {
        return $user->can(PermissionName::WarehouseEdit->value) && $this->access->allows($user, $warehouse);
    }
}
