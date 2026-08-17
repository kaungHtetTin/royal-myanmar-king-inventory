<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            ['sku' => 'DW-1L', 'name' => 'Drinking Water 1 Litre', 'category' => 'Drinking Water', 'unit' => 'bottle', 'selling_price' => 1000, 'barcode' => '8850000000011'],
            ['sku' => 'MW-500ML', 'name' => 'Mineral Water 500 ml', 'category' => 'Mineral Water', 'unit' => 'bottle', 'selling_price' => 700, 'barcode' => '8850000000028'],
            ['sku' => 'DW-12PK', 'name' => 'Drinking Water 12 Bottle Pack', 'category' => 'Drinking Water', 'unit' => 'box', 'selling_price' => 10500, 'barcode' => '8850000000035'],
        ];

        foreach ($products as $product) {
            Product::query()->updateOrCreate(['sku' => $product['sku']], $product + ['description' => null, 'is_active' => true]);
        }
    }
}
