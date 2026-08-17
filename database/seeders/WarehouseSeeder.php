<?php

namespace Database\Seeders;

use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class WarehouseSeeder extends Seeder
{
    public function run(): void
    {
        $warehouses = [
            ['code' => 'YGN-MAIN', 'name' => 'Yangon Main Warehouse', 'region' => 'Yangon', 'township' => 'Hlaing', 'address' => 'Yangon distribution hub', 'phone' => null, 'notes' => 'Primary local demonstration warehouse.'],
            ['code' => 'MDY-MAIN', 'name' => 'Mandalay Main Warehouse', 'region' => 'Mandalay', 'township' => 'Chanayethazan', 'address' => 'Mandalay distribution hub', 'phone' => null, 'notes' => 'Upper Myanmar demonstration warehouse.'],
            ['code' => 'NPT-MAIN', 'name' => 'Nay Pyi Taw Warehouse', 'region' => 'Nay Pyi Taw', 'township' => 'Zabuthiri', 'address' => 'Nay Pyi Taw distribution hub', 'phone' => null, 'notes' => 'Central demonstration warehouse.'],
        ];

        foreach ($warehouses as $warehouse) {
            Warehouse::query()->updateOrCreate(['code' => $warehouse['code']], $warehouse + ['is_active' => true]);
        }
    }
}
