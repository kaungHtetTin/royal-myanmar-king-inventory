<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\Region;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            ['sku' => 'DW-1L', 'name' => 'Drinking Water 1 Litre', 'category' => 'Drinking Water', 'units' => [
                ['name' => 'bottle', 'factor' => 1, 'barcode' => '8850000000011', 'base' => true, 'default' => false, 'price' => 1000],
                ['name' => 'carton', 'factor' => 12, 'barcode' => '8850000000110', 'base' => false, 'default' => true, 'price' => 11500],
            ]],
            ['sku' => 'MW-500ML', 'name' => 'Mineral Water 500 ml', 'category' => 'Mineral Water', 'units' => [
                ['name' => 'bottle', 'factor' => 1, 'barcode' => '8850000000028', 'base' => true, 'default' => false, 'price' => 700],
                ['name' => 'pack', 'factor' => 24, 'barcode' => '8850000000226', 'base' => false, 'default' => true, 'price' => 16000],
            ]],
            ['sku' => 'JW-20L', 'name' => 'Drinking Water 20 Litre Jar', 'category' => 'Drinking Water', 'units' => [
                ['name' => 'jar', 'factor' => 1, 'barcode' => '8850000000035', 'base' => true, 'default' => true, 'price' => 2500],
            ]],
        ];

        $regions = Region::query()->with('warehouse:id,code')->orderBy('id')->get();
        foreach ($products as $product) {
            $default = collect($product['units'])->firstWhere('default', true);
            $model = Product::query()->updateOrCreate(['sku' => $product['sku']], [
                'name' => $product['name'], 'category' => $product['category'], 'unit' => $default['name'],
                'selling_price' => $default['price'], 'barcode' => $default['barcode'],
                'description' => 'Seeded with base-unit conversion and a price for every sales region.', 'is_active' => true,
            ]);

            foreach ($product['units'] as $unitData) {
                $unit = $model->units()->updateOrCreate(['name' => $unitData['name']], [
                    'conversion_factor' => $unitData['factor'], 'barcode' => $unitData['barcode'],
                    'is_base' => $unitData['base'], 'is_default_selling' => $unitData['default'], 'is_active' => true,
                ]);
                foreach ($regions as $region) {
                    $adjustment = match ($region->warehouse->code) {
                        'MDY-MAIN' => 100,
                        'NPT-MAIN' => 50,
                        default => str_contains($region->name, 'East') ? 25 : 0,
                    };
                    $unit->regionPrices()->updateOrCreate(
                        ['region_id' => $region->id],
                        ['price' => $unitData['price'] + ($adjustment * $unitData['factor'])],
                    );
                }
            }
        }
    }
}
