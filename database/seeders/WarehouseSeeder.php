<?php

namespace Database\Seeders;

use App\Models\Region;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class WarehouseSeeder extends Seeder
{
    public function run(): void
    {
        $warehouses = [
            ['code' => 'YGN-MAIN', 'name' => 'Yangon Main Warehouse', 'address' => 'Yangon distribution hub', 'regions' => ['Yangon West' => ['Hlaing', 'Kamayut'], 'Yangon East' => ['Tamwe', 'Thingangyun']]],
            ['code' => 'MDY-MAIN', 'name' => 'Mandalay Main Warehouse', 'address' => 'Mandalay distribution hub', 'regions' => ['Mandalay Central' => ['Chanayethazan', 'Aungmyaythazan'], 'Mandalay South' => ['Chanmyathazi', 'Pyigyidagun']]],
            ['code' => 'NPT-MAIN', 'name' => 'Nay Pyi Taw Warehouse', 'address' => 'Nay Pyi Taw distribution hub', 'regions' => ['Nay Pyi Taw North' => ['Zabuthiri', 'Ottarathiri'], 'Nay Pyi Taw South' => ['Dekkhinathiri', 'Pobbathiri']]],
        ];

        foreach ($warehouses as $warehouse) {
            $model = Warehouse::query()->updateOrCreate(['code' => $warehouse['code']], [
                'name' => $warehouse['name'],
                'address' => $warehouse['address'], 'phone' => null,
                'notes' => 'Demonstration warehouse with regional sales coverage.', 'is_active' => true,
            ]);

            foreach (array_keys($warehouse['regions']) as $regionName) {
                Region::query()->updateOrCreate(
                    ['warehouse_id' => $model->id, 'name' => $regionName],
                    ['notes' => null, 'is_active' => true],
                );
            }
        }
    }
}
