<?php

namespace App\Policies;

use App\Enums\PermissionName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Services\RepresentativeAccess;

class SalesRepresentativePolicy
{
    public function __construct(private readonly RepresentativeAccess $access) {}

    public function view(User $user, SalesRepresentative $salesRepresentative): bool
    {
        return $this->access->allows($user, $salesRepresentative);
    }

    public function viewAny(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::RepresentativeView->value);
    }

    public function create(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::RepresentativeCreate->value);
    }

    public function update(User $user, SalesRepresentative $salesRepresentative): bool
    {
        return $user->is_active
            && $user->can(PermissionName::RepresentativeEdit->value)
            && $this->access->allows($user, $salesRepresentative);
    }
}
