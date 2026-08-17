<?php

namespace Database\Seeders;

use App\Enums\RoleName;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use LogicException;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $password = env('SUPER_ADMIN_PASSWORD');

        if (! $password && app()->isProduction()) {
            throw new LogicException('SUPER_ADMIN_PASSWORD must be configured before production seeding.');
        }

        $user = User::query()->firstOrNew([
            'email' => env('SUPER_ADMIN_EMAIL', 'admin@stockflow.local'),
        ]);

        $user->fill([
            'name' => env('SUPER_ADMIN_NAME', 'Super Admin'),
            'username' => env('SUPER_ADMIN_USERNAME', 'superadmin'),
            'is_active' => true,
        ]);

        if (! $user->exists || $password) {
            $user->password = $password ?: 'password';
        }

        $user->save();

        $this->call(AccessControlSeeder::class);
        $user->syncRoles([RoleName::SuperAdmin->value]);
        if (app()->isLocal()) {
            $this->call(WarehouseSeeder::class);
            $this->call(ProductSeeder::class);
            $this->call(VehicleSeeder::class);
            $this->call(CustomerSeeder::class);
            $this->call(SalesRepresentativeSeeder::class);
            $this->call(InventorySeeder::class);
            $this->call(TransferSeeder::class);
            $this->call(SaleSeeder::class);
            $this->call(SettlementSeeder::class);
        }
    }
}
