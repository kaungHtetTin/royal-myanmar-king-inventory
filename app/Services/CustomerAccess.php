<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class CustomerAccess
{
    public function __construct(private readonly WarehouseAccess $warehouseAccess) {}

    public function allows(User $user, Customer $customer): bool
    {
        return $this->warehouseAccess->allows($user, $customer->warehouse_id);
    }

    /** @param Builder<Customer> $query */
    public function scope(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        return $query->whereIn('warehouse_id', $user->warehouses()->select('warehouses.id'));
    }
}
