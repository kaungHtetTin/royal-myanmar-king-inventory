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
use App\Models\Way;
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

    public function test_region_unit_pricing_foc_and_way_reporting_are_transactionally_integrated(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);
        $warehouse = Warehouse::factory()->create(['code' => 'REG-WH', 'name' => 'Regional Warehouse']);
        $north = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'North', 'is_active' => true]);
        Way::query()->create(['region_id' => $north->id, 'code' => 'WAY-NORTH', 'name' => 'North Route', 'is_active' => true]);
        $south = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'South', 'is_active' => true]);
        $southWay = Way::query()->create(['region_id' => $south->id, 'code' => 'WAY-SOUTH', 'name' => 'South Route', 'is_active' => true]);

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
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'way_id' => $southWay->id, 'credit_allowed' => false]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $product->id, 'quantity' => 100, 'foc_quantity' => 24]);

        $sale = $this->actingAs($repUser)->withHeader('Idempotency-Key', 'regional-sale-create')->postJson('/api/sales/sales', [
            'customer_id' => $customer->id, 'payment_type' => 'cash',
            'creation_latitude' => 16.8409, 'creation_longitude' => 96.1735, 'location_accuracy_meters' => 12,
            'items' => [['product_id' => $product->id, 'product_unit_id' => $box->id, 'quantity' => 2, 'foc_product_unit_id' => $bottle->id, 'foc_quantity' => 3]],
        ])->assertCreated()->assertJsonPath('data.total_amount', 24000)->assertJsonPath('data.region.id', $south->id)->assertJsonPath('data.way.id', $southWay->id);
        $saleId = $sale->json('data.id');
        $this->withHeader('Idempotency-Key', 'regional-sale-post')->postJson("/api/sales/sales/{$saleId}/post")->assertOk();
        $balance = RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->where('product_id', $product->id)->firstOrFail();
        $this->assertSame(76, $balance->quantity);
        $this->assertSame(21, $balance->foc_quantity);
        $this->assertDatabaseHas('stock_movements', ['source_type' => 'sale', 'source_id' => $saleId, 'movement_type' => 'SALE_FOC_OUT', 'quantity' => 3]);

        $this->actingAs($admin)->getJson('/api/admin/reports/way-sales-power?way_id='.$southWay->id.'&per_page=10')->assertOk()
            ->assertJsonPath('summary.gross_sales', 24000)->assertJsonPath('summary.paid_base_units', 24)
            ->assertJsonPath('summary.foc_base_units', 3)->assertJsonPath('data.0.representative.id', $representative->id);

        $export = $this->actingAs($admin)->get('/api/admin/reports/way-sales-power/export?warehouse_id='.$warehouse->id.'&region_id='.$south->id.'&way_id='.$southWay->id);
        $export->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');
        $csv = $export->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $lines = preg_split('/\R/', trim(substr($csv, 3)));
        $this->assertSame(
            ['Warehouse Code', 'Warehouse', 'Region', 'Way Code', 'Way', 'Representative Code', 'Representative', 'Sales Amount (MMK)', 'Paid Base Units', 'FOC Base Units', 'Invoices', 'Customers'],
            str_getcsv($lines[0]),
        );
        $this->assertSame(
            ['REG-WH', 'Regional Warehouse', 'South', 'WAY-SOUTH', 'South Route', $representative->code, $representative->name, '24000', '24', '3', '1', '1'],
            str_getcsv($lines[1]),
        );

        $unpriced = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'Unpriced', 'is_active' => true]);
        $unpricedWay = Way::query()->create(['region_id' => $unpriced->id, 'code' => 'WAY-UNPRICED', 'name' => 'Unpriced Route', 'is_active' => true]);
        $representative->regions()->attach($unpriced->id);
        $unpricedCustomer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'way_id' => $unpricedWay->id]);
        $this->actingAs($repUser)->withHeader('Idempotency-Key', 'missing-price')->postJson('/api/sales/sales', [
            'customer_id' => $unpricedCustomer->id, 'payment_type' => 'cash',
            'creation_latitude' => 16.8409, 'creation_longitude' => 96.1735, 'location_accuracy_meters' => 12,
            'items' => [['product_id' => $product->id, 'product_unit_id' => $bottle->id, 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonValidationErrors('items');
    }

    public function test_representative_issue_converts_units_and_keeps_foc_separate_without_a_capacity_limit(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);
        $warehouse = Warehouse::factory()->create(['code' => 'ISS-WH']);
        $region = Region::query()->create(['warehouse_id' => $warehouse->id, 'name' => 'Issue Region', 'is_active' => true]);
        $way = Way::query()->create(['region_id' => $region->id, 'code' => 'WAY-ISSUE', 'name' => 'Issue Route', 'is_active' => true]);
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

        $query = '?warehouse_id='.$warehouse->id.'&region_id='.$region->id.'&way_id='.$way->id.'&date_from='.today()->toDateString().'&date_to='.today()->toDateString();
        $this->actingAs($admin)->getJson('/api/admin/reports/stock-issues'.$query)->assertOk()
            ->assertJsonPath('summary.total_issued_units', 138)
            ->assertJsonPath('summary.paid_base_units', 132)
            ->assertJsonPath('summary.foc_base_units', 6)
            ->assertJsonPath('summary.issues', 2)
            ->assertJsonPath('summary.representatives', 1)
            ->assertJsonPath('summary.products', 1)
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.product.id', $product->id)
            ->assertJsonPath('data.0.product.sku', $product->sku)
            ->assertJsonPath('data.0.paid_base_units', 132)
            ->assertJsonPath('data.0.foc_base_units', 6)
            ->assertJsonPath('data.0.total_issued_units', 138)
            ->assertJsonPath('data.0.issues', 2)
            ->assertJsonPath('data.0.representatives', 1)
            ->assertJsonPath('rules.date', 'dispatched_at')
            ->assertJsonPath('rules.coverage_filters', 'representative_region_assignment');

        $export = $this->actingAs($admin)->get('/api/admin/reports/stock-issues/export'.$query);
        $export->assertOk()->assertHeader('content-type', 'text/csv; charset=UTF-8');
        $csv = $export->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);
        $lines = preg_split('/\R/', trim(substr($csv, 3)));
        $this->assertSame(
            ['Product SKU', 'Product', 'Base Unit', 'Paid Base Units', 'FOC Base Units', 'Total Issued Units', 'Issue Count', 'Representatives'],
            str_getcsv($lines[0]),
        );
        $row = str_getcsv($lines[1]);
        $this->assertSame($product->sku, $row[0]);
        $this->assertSame($product->name, $row[1]);
        $this->assertSame($product->unit, $row[2]);
        $this->assertSame(['132', '6', '138', '2', '1'], array_slice($row, 3));
    }
}
