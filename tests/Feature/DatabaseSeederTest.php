<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\ApplicationSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\EssentialSetupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_seeding_creates_only_system_initial_data_and_admin_account(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(EssentialSetupSeeder::class);

        $admin = User::query()->sole();
        $this->assertSame('superadmin', $admin->username);
        $this->assertSame('Super Admin', $admin->name);
        $this->assertSame('admin@stockflow.local', $admin->email);
        $this->assertTrue($admin->is_active);
        $this->assertNull($admin->deactivated_at);
        $this->assertTrue($admin->hasRole(RoleName::SuperAdmin->value));
        $this->assertTrue(Hash::check(env('SUPER_ADMIN_PASSWORD') ?: 'password', $admin->password));
        $this->assertDatabaseCount('roles', count(RoleName::cases()));
        $this->assertDatabaseCount('permissions', count(PermissionName::cases()));
        $this->assertSame(
            count(PermissionName::cases()),
            Role::findByName(RoleName::SuperAdmin->value)->permissions()->count(),
        );
        $this->assertSame(
            collect(PermissionName::cases())->map->value->sort()->values()->all(),
            Permission::query()->pluck('name')->sort()->values()->all(),
        );

        $settings = ApplicationSetting::query()->sole();
        $this->assertSame('StockFlow', $settings->business_name);
        $this->assertSame('#087f74', $settings->primary_color);
        $this->assertSame('MMK', $settings->currency_code);
        $this->assertSame(env('APP_TIMEZONE', 'Asia/Yangon'), $settings->timezone);
        $this->assertSame(10, $settings->low_stock_threshold);
        $this->assertSame($admin->id, $settings->updated_by);

        foreach ([
            'warehouses',
            'products',
            'vehicles',
            'customers',
            'sales_representatives',
            'warehouse_inventories',
            'representative_inventories',
            'stock_imports',
            'warehouse_transfers',
            'representative_transfers',
            'sales',
            'cash_submissions',
        ] as $table) {
            $this->assertDatabaseCount($table, 0);
        }
    }
}
