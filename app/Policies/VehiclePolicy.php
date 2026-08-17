<?php

namespace App\Policies;

use App\Enums\PermissionName;
use App\Models\User;
use App\Models\Vehicle;

class VehiclePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::VehicleView->value);
    }

    public function view(User $user, Vehicle $vehicle): bool
    {
        return $user->is_active && $user->can(PermissionName::VehicleView->value);
    }

    public function create(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::VehicleCreate->value);
    }

    public function update(User $user, Vehicle $vehicle): bool
    {
        return $user->is_active && $user->can(PermissionName::VehicleEdit->value);
    }
}
