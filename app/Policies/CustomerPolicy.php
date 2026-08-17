<?php

namespace App\Policies;

use App\Enums\PermissionName;
use App\Models\Customer;
use App\Models\User;
use App\Services\CustomerAccess;

class CustomerPolicy
{
    public function __construct(private readonly CustomerAccess $access) {}

    public function viewAny(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::CustomerView->value);
    }

    public function view(User $user, Customer $customer): bool
    {
        return $user->is_active && $user->can(PermissionName::CustomerView->value) && $this->access->allows($user, $customer);
    }

    public function create(User $user): bool
    {
        return $user->is_active && $user->can(PermissionName::CustomerCreate->value);
    }

    public function update(User $user, Customer $customer): bool
    {
        return $user->is_active && $user->can(PermissionName::CustomerEdit->value) && $this->access->allows($user, $customer);
    }

    public function manageCredit(User $user, Customer $customer): bool
    {
        return $user->is_active
            && $user->can(PermissionName::CustomerCreditManage->value)
            && $this->access->allows($user, $customer);
    }
}
