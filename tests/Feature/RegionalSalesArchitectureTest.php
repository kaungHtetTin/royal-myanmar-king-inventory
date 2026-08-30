<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Region;
use App\Models\RepresentativeInventory;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegionalSalesArchitectureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_region_unit_pricing_and_foc_are_transactionally_integrated(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);
        $warehouse = Warehouse::factory()->create(['code' => 'REG-WH', 'name' => 'Regional Warehouse']);
        $north = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'North', 'is_active' => true]);
        $south = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'South', 'is_active' => true]);

        $payload = [
            'sku' => 'WATER-1L', 'name' => 'Water 1 Litre', 'category' => 'Water', 'description' => null, 'is_active' => true,
            'units' => [
                ['name' => 'bottle', 'conversion_factor' => 1, 'barcode' => 'BOTTLE-1', 'is_base' => true, 'is_default_selling' => false, 'is_active' => true, 'prices' => [['region_id' => $north->id, 'price' => 1000], ['region_id' => $south->id, 'price' => 1200]]],
                ['name' => 'box', 'conversion_factor' => 12, 'barcode' => 'BOX-12', 'is_base' => false, 'is_default_selling' => true, 'is_active' => true, 'prices' => [['region_id' => $north->id, 'price' => 10000], ['region_id' => $south->id, 'price' => 12000]]],
            ],
        ];
        $productResponse = $this->actingAs($admin)->postJson('/api/admin/products', $payload)->assertCreated();
        $product = Product::query()->findOrFail($productResponse->json('data.id'));
        $bottle = $product->units()->where('name', 'bottle')->firstOrFail();
        $box = $product->units()->where('name', 'box')->firstOrFail();

        $repUser = User::factory()->create();
        $repUser->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::factory()->create(['user_id' => $repUser->id, 'primary_warehouse_id' => $warehouse->id]);
        $representative->regions()->sync([$north->id, $south->id]);
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'region_id' => $south->id, 'credit_allowed' => false]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $product->id, 'quantity' => 100, 'foc_quantity' => 24]);

        $sale = $this->actingAs($repUser)->withHeader('Idempotency-Key', 'regional-sale-create')->postJson('/api/sales/sales', [
            'customer_id' => $customer->id, 'payment_type' => 'cash',
            'creation_latitude' => 16.8409, 'creation_longitude' => 96.1735, 'location_accuracy_meters' => 12,
            'items' => [['product_id' => $product->id, 'product_unit_id' => $box->id, 'quantity' => 2, 'foc_product_unit_id' => $bottle->id, 'foc_quantity' => 3]],
        ])->assertCreated()->assertJsonPath('data.total_amount', 24000)->assertJsonPath('data.region.id', $south->id)->assertJsonMissingPath('data.way');
        $saleId = $sale->json('data.id');
        $this->withHeader('Idempotency-Key', 'regional-sale-post')->postJson("/api/sales/sales/{$saleId}/post")->assertOk();
        $balance = RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->where('product_id', $product->id)->firstOrFail();
        $this->assertSame(76, $balance->quantity);
        $this->assertSame(21, $balance->foc_quantity);
        $this->assertDatabaseHas('stock_movements', ['source_type' => 'sale', 'source_id' => $saleId, 'movement_type' => 'SALE_FOC_OUT', 'quantity' => 3]);

        $this->actingAs($admin)->getJson('/api/admin/reports/way-sales-power')->assertNotFound();

        $unpriced = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'Unpriced', 'is_active' => true]);
        $representative->regions()->attach($unpriced->id);
        $unpricedCustomer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'region_id' => $unpriced->id]);
        $this->actingAs($repUser)->withHeader('Idempotency-Key', 'missing-price')->postJson('/api/sales/sales', [
            'customer_id' => $unpricedCustomer->id, 'payment_type' => 'cash',
            'creation_latitude' => 16.8409, 'creation_longitude' => 96.1735, 'location_accuracy_meters' => 12,
            'items' => [['product_id' => $product->id, 'product_unit_id' => $bottle->id, 'quantity' => 1]],
        ])->assertNotFound();
    }

    public function test_representative_issue_converts_units_and_keeps_foc_separate_without_a_capacity_limit(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);
        $warehouse = Warehouse::factory()->create(['code' => 'ISS-WH']);
        $region = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'Issue Region', 'is_active' => true]);
        $product = Product::factory()->create(['unit' => 'bottle', 'selling_price' => 1000]);
        $bottle = $product->baseUnit()->firstOrFail();
        $box = $product->units()->create(['name' => 'box', 'conversion_factor' => 12, 'is_base' => false, 'is_default_selling' => false, 'is_active' => true]);
        $repUser = User::factory()->create();
        $repUser->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::factory()->create(['user_id' => $repUser->id, 'primary_warehouse_id' => $warehouse->id]);
        WarehouseInventory::query()->create(['warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'quantity' => 500]);

        $transfer = $this->actingAs($admin)->postJson('/api/admin/representative-transfers', [
            'source_warehouse_id' => $warehouse->id, 'sales_representative_id' => $representative->id,
            'items' => [['product_id' => $product->id, 'product_unit_id' => $box->id, 'quantity' => 10, 'foc_product_unit_id' => $bottle->id, 'foc_quantity' => 5]],
        ])->assertCreated();
        $id = $transfer->json('data.id');
        $this->withHeader('Idempotency-Key', 'issue-dispatch')->postJson("/api/admin/representative-transfers/{$id}/dispatch")->assertOk();
        $this->actingAs($repUser)->withHeader('Idempotency-Key', 'issue-receive')->postJson("/api/sales/receivings/{$id}/receive")->assertOk();
        $balance = RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->where('product_id', $product->id)->firstOrFail();
        $this->assertSame(120, $balance->quantity);
        $this->assertSame(5, $balance->foc_quantity);
        $this->assertSame(375, WarehouseInventory::query()->where('warehouse_id', $warehouse->id)->where('product_id', $product->id)->value('quantity'));

        $secondTransfer = $this->actingAs($admin)->postJson('/api/admin/representative-transfers', [
            'source_warehouse_id' => $warehouse->id, 'sales_representative_id' => $representative->id,
            'items' => [['product_id' => $product->id, 'product_unit_id' => $box->id, 'quantity' => 1, 'foc_product_unit_id' => $bottle->id, 'foc_quantity' => 1]],
        ])->assertCreated();
        $secondId = $secondTransfer->json('data.id');
        $this->withHeader('Idempotency-Key', 'issue-dispatch-second')->postJson("/api/admin/representative-transfers/{$secondId}/dispatch")->assertOk();
        $this->actingAs($repUser)->withHeader('Idempotency-Key', 'issue-receive-second')->postJson("/api/sales/receivings/{$secondId}/receive")->assertOk();

        $this->actingAs($admin)->getJson('/api/admin/reports/stock-issues')->assertNotFound();
    }
}
