<?php

namespace Database\Seeders;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class AccessControlSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = collect(PermissionName::cases())
            ->mapWithKeys(fn (PermissionName $permission) => [
                $permission->value => Permission::findOrCreate($permission->value, 'web'),
            ]);

        Role::findOrCreate(RoleName::SuperAdmin->value, 'web')->syncPermissions($permissions->values());

        Role::findOrCreate(RoleName::OfficeAdmin->value, 'web')->syncPermissions([
            $permissions[PermissionName::DashboardView->value],
            $permissions[PermissionName::WarehouseView->value],
        ]);

        Role::findOrCreate(RoleName::SalesRepresentative->value, 'web')->syncPermissions([
            $permissions[PermissionName::RepresentativeStockView->value],
            $permissions[PermissionName::RepresentativeStockReceive->value],
            $permissions[PermissionName::CustomerView->value],
            $permissions[PermissionName::SaleView->value],
            $permissions[PermissionName::SaleCreate->value],
            $permissions[PermissionName::CashView->value],
            $permissions[PermissionName::CashSubmit->value],
            $permissions[PermissionName::ReportView->value],
        ]);

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
}
