<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\Region;
use App\Models\SalesRepresentative;
use Database\Seeders\AccessControlSeeder;
use Database\Seeders\CustomerSeeder;
use Database\Seeders\DatabaseSeeder;
use Database\Seeders\DemoDataSeeder;
use Database\Seeders\ProductSeeder;
use Database\Seeders\SalesRepresentativeSeeder;
use Database\Seeders\VehicleSeeder;
use Database\Seeders\WarehouseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoDataArchitectureSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_master_data_seeders_follow_the_regional_sales_architecture_and_are_idempotent(): void
    {
        $this->seed(AccessControlSeeder::class);
        $this->seed(DatabaseSeeder::class);

        foreach ([WarehouseSeeder::class, ProductSeeder::class, VehicleSeeder::class, SalesRepresentativeSeeder::class, CustomerSeeder::class] as $seeder) {
            $this->seed($seeder);
            $this->seed($seeder);
        }

        $this->assertDatabaseCount('warehouses', 3);
        $this->assertDatabaseCount('regions', 6);

        $representative = SalesRepresentative::query()->where('code', 'SR-001')->firstOrFail();
        $this->assertCount(2, $representative->regions);

        $customer = Customer::query()->where('code', 'CUS-SHWE')->with('assignedRegion')->firstOrFail();
        $this->assertSame('Tamwe', $customer->township);
        $this->assertSame('Yangon East', $customer->assignedRegion->name);
        $this->assertSame($customer->warehouse_id, $customer->assignedRegion->warehouse_id);

        $product = Product::query()->where('sku', 'DW-1L')->with('units.regionPrices')->firstOrFail();
        $this->assertSame('bottle', $product->units->firstWhere('is_base', true)->name);
        $this->assertSame('carton', $product->units->firstWhere('is_default_selling', true)->name);
        $this->assertSame(Region::query()->count(), $product->units->first()->regionPrices->count());
        $this->assertGreaterThan(1, $product->units->first()->regionPrices->pluck('price')->unique()->count());
    }

    public function test_complete_demo_data_seeder_builds_operational_data(): void
    {
        $this->seed(DemoDataSeeder::class);

        $this->assertDatabaseCount('sales', 3);
        $this->assertDatabaseHas('sale_items', ['foc_quantity' => 2, 'foc_base_quantity' => 2]);
        $this->assertDatabaseCount('region_sales_representative', 6);
    }
}
