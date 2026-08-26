<?php

namespace Database\Seeders;

use App\Models\Region;
use App\Models\Warehouse;
use App\Models\Way;
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

        $wayNumber = 1;
        foreach ($warehouses as $warehouse) {
            $firstRegion = array_key_first($warehouse['regions']);
            $model = Warehouse::withoutEvents(fn () => Warehouse::query()->updateOrCreate(['code' => $warehouse['code']], [
                'name' => $warehouse['name'], 'region' => $firstRegion, 'township' => $warehouse['regions'][$firstRegion][0],
                'address' => $warehouse['address'], 'phone' => null,
                'notes' => 'Demonstration warehouse with regional sales coverage.', 'is_active' => true,
            ]));

            foreach ($warehouse['regions'] as $regionName => $ways) {
                $region = Region::query()->updateOrCreate(
                    ['warehouse_id' => $model->id, 'name' => $regionName],
                    ['notes' => null, 'is_active' => true],
                );
                foreach ($ways as $wayName) {
                    $way = Way::query()->where('region_id', $region->id)->where('name', $wayName)->first()
                        ?? new Way(['region_id' => $region->id, 'name' => $wayName]);
                    $way->fill(['notes' => null, 'is_active' => true]);
                    $way->code ??= 'WAY-'.str_pad((string) $wayNumber, 6, '0', STR_PAD_LEFT);
                    $way->save();
                    $wayNumber++;
                }
            }
        }
    }
}
