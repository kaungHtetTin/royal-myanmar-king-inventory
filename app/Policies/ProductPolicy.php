<?php

namespace App\Policies;

use App\Enums\PermissionName;
use App\Models\Product;
use App\Models\User;

class ProductPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::ProductView->value);
    }

    public function view(User $user, Product $product): bool
    {
        return $user->is_active && $user->can(PermissionName::ProductView->value);
    }

    public function create(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::ProductCreate->value);
    }

    public function update(User $user, Product $product): bool
    {
        return $user->is_active && $user->can(PermissionName::ProductEdit->value);
    }
}
