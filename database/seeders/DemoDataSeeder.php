<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            DatabaseSeeder::class,
            WarehouseSeeder::class,
            ProductSeeder::class,
            VehicleSeeder::class,
            SalesRepresentativeSeeder::class,
            CustomerSeeder::class,
            InventorySeeder::class,
            TransferSeeder::class,
            SaleSeeder::class,
            SettlementSeeder::class,
        ]);
    }
}
