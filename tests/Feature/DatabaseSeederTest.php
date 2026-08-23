<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\ApplicationSetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DatabaseSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_seeding_creates_only_system_initial_data_and_admin_account(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $admin = User::query()->sole();
        $this->assertSame('superadmin', $admin->username);
        $this->assertTrue($admin->hasRole(RoleName::SuperAdmin->value));
        $this->assertTrue(Hash::check(env('SUPER_ADMIN_PASSWORD') ?: 'password', $admin->password));
        $this->assertSame('StockFlow', ApplicationSetting::query()->sole()->business_name);

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
