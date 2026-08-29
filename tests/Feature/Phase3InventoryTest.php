<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\StockAdjustment;
use App\Models\StockImport;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Phase3InventoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_on_hand_groups_products_across_warehouses_and_scopes_selected_warehouse(): void
    {
        $admin = $this->superAdmin();
        [$yangon, $mandalay] = Warehouse::factory()->count(2)->create();
        [$water, $juice] = Product::factory()->count(2)->create();
        $water->defaultSellingUnit()->update(['is_default_selling' => false]);
        $water->units()->create([
            'name' => 'box',
            'conversion_factor' => 12,
            'is_base' => false,
            'is_default_selling' => true,
            'is_active' => true,
        ]);
        WarehouseInventory::query()->create(['warehouse_id' => $yangon->id, 'product_id' => $water->id, 'quantity' => 10]);
        WarehouseInventory::query()->create(['warehouse_id' => $mandalay->id, 'product_id' => $water->id, 'quantity' => 15]);
        WarehouseInventory::query()->create(['warehouse_id' => $yangon->id, 'product_id' => $juice->id, 'quantity' => 4]);

        $this->actingAs($admin)->getJson('/api/admin/inventory?stock=all')->assertOk()
            ->assertJsonPath('meta.total', 2)->assertJsonPath('summary.products', 2)->assertJsonPath('summary.units', 29)
            ->assertJsonPath('data.0.product.id', $water->id)->assertJsonPath('data.0.quantity', 25)
            ->assertJsonPath('data.0.product.base_unit.name', $water->baseUnit()->value('name'))
            ->assertJsonPath('data.0.product.default_selling_unit.name', 'box')
            ->assertJsonPath('data.0.product.default_selling_unit.conversion_factor', 12)
            ->assertJsonMissingPath('data.0.warehouse');

        $this->getJson('/api/admin/inventory?warehouse_id='.$yangon->id.'&stock=all')->assertOk()
            ->assertJsonPath('meta.total', 2)->assertJsonPath('summary.products', 2)->assertJsonPath('summary.units', 14)
            ->assertJsonPath('data.0.product.id', $water->id)->assertJsonPath('data.0.quantity', 10);
    }

    public function test_on_hand_csv_exports_every_matching_filtered_item(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create(['code' => 'YGN-EXPORT']);
        foreach (range(1, 25) as $number) {
            $product = Product::factory()->create([
                'sku' => sprintf('EXP-%03d', $number),
                'name' => sprintf('Export Product %03d', $number),
                'unit' => 'piece',
            ]);
            WarehouseInventory::query()->create([
                'warehouse_id' => $warehouse->id,
                'product_id' => $product->id,
                'quantity' => $number,
            ]);
        }
        $excluded = Product::factory()->create(['sku' => 'OTHER-001', 'name' => 'Excluded Product']);
        WarehouseInventory::query()->create([
            'warehouse_id' => $warehouse->id,
            'product_id' => $excluded->id,
            'quantity' => 0,
        ]);

        $response = $this->actingAs($admin)->get('/api/admin/inventory/export?warehouse_id='.$warehouse->id.'&search=Export&stock=positive');

        $response->assertOk()->assertDownload();
        $content = $response->streamedContent();
        $this->assertStringContainsString('SKU,Product,"Base unit","On hand","Last changed"', $content);
        $this->assertStringContainsString('EXP-001,"Export Product 001",piece,1,', $content);
        $this->assertStringContainsString('EXP-025,"Export Product 025",piece,25,', $content);
        $this->assertSame(26, substr_count(trim($content), "\n") + 1);
        $this->assertStringNotContainsString('OTHER-001', $content);
    }

    public function test_draft_import_is_editable_stock_neutral_and_uses_unique_references(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        [$first, $second] = Product::factory()->count(2)->create();

        $created = $this->actingAs($admin)->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [
            ['product_id' => $first->id, 'quantity' => 10],
        ]))->assertCreated()->assertJsonPath('data.status', 'draft');
        $id = $created->json('data.id');
        $this->assertSame('IMP-000001', $created->json('data.reference'));
        $this->assertDatabaseCount('warehouse_inventories', 0);
        $this->assertDatabaseCount('stock_movements', 0);

        $this->putJson("/api/admin/stock-imports/{$id}", $this->importPayload($warehouse, [
            ['product_id' => $second->id, 'quantity' => 7],
        ]))->assertOk()->assertJsonPath('data.items.0.product.id', $second->id);
        $this->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [
            ['product_id' => $first->id, 'quantity' => 1],
        ]))->assertCreated()->assertJsonPath('data.reference', 'IMP-000002');
        $this->assertDatabaseHas('audit_logs', ['event' => 'stock_import.created', 'subject_id' => $id]);
        $this->assertDatabaseHas('audit_logs', ['event' => 'stock_import.updated', 'subject_id' => $id]);
    }

    public function test_import_can_update_product_price_when_user_is_authorized(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $product = Product::factory()->create(['selling_price' => 1200]);

        $this->actingAs($admin)->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [
            ['product_id' => $product->id, 'quantity' => 10, 'selling_price' => 1500],
        ]))->assertCreated()
            ->assertJsonPath('data.items.0.product.selling_price', 1500);

        $this->assertSame(1500, $product->fresh()->selling_price);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $admin->id,
            'event' => 'product.price_updated',
            'subject_id' => $product->id,
        ]);
        $this->assertDatabaseHas('stock_import_items', [
            'product_id' => $product->id,
            'quantity' => 10,
        ]);
    }

    public function test_import_price_update_requires_product_edit_permission_and_rolls_back(): void
    {
        $importer = $this->officeUser(PermissionName::InventoryImport);
        $warehouse = Warehouse::factory()->create();
        $importer->warehouses()->attach($warehouse, ['assigned_by' => $importer->id]);
        $product = Product::factory()->create(['selling_price' => 1200]);

        $this->actingAs($importer)->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [
            ['product_id' => $product->id, 'quantity' => 10, 'selling_price' => 1500],
        ]))->assertForbidden();

        $this->assertSame(1200, $product->fresh()->selling_price);
        $this->assertDatabaseCount('stock_imports', 0);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'product.price_updated']);
    }

    public function test_post_import_is_atomic_audited_and_idempotent(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        [$first, $second] = Product::factory()->count(2)->create();
        $import = $this->createImport($admin, $warehouse, [
            ['product_id' => $first->id, 'quantity' => 12],
            ['product_id' => $second->id, 'quantity' => 8],
        ]);

        $this->withHeader('Idempotency-Key', 'post-import-1')->postJson("/api/admin/stock-imports/{$import->id}/post")
            ->assertOk()->assertJsonPath('data.status', 'posted');
        $this->assertDatabaseHas('warehouse_inventories', ['warehouse_id' => $warehouse->id, 'product_id' => $first->id, 'quantity' => 12]);
        $this->assertDatabaseHas('warehouse_inventories', ['warehouse_id' => $warehouse->id, 'product_id' => $second->id, 'quantity' => 8]);
        $this->assertSame(2, StockMovement::query()->where('movement_type', 'IMPORT_IN')->count());
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'stock_import.posted', 'subject_id' => $import->id]);

        $this->withHeader('Idempotency-Key', 'post-import-1')->postJson("/api/admin/stock-imports/{$import->id}/post")->assertOk();
        $this->assertSame(12, WarehouseInventory::query()->whereBelongsTo($first)->whereBelongsTo($warehouse)->value('quantity'));
        $this->assertSame(2, StockMovement::query()->count());
        $this->withHeader('Idempotency-Key', 'post-import-2')->postJson("/api/admin/stock-imports/{$import->id}/post")
            ->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
        $this->putJson("/api/admin/stock-imports/{$import->id}", $this->importPayload($warehouse, [['product_id' => $first->id, 'quantity' => 99]]))
            ->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
    }

    public function test_import_uses_the_selected_product_unit_and_posts_its_base_quantity(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $product = Product::factory()->create(['unit' => 'bottle']);
        $box = ProductUnit::query()->create([
            'product_id' => $product->id,
            'name' => 'box',
            'conversion_factor' => 12,
            'is_base' => false,
            'is_default_selling' => false,
            'is_active' => true,
        ]);

        $created = $this->actingAs($admin)->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [
            ['product_id' => $product->id, 'product_unit_id' => $box->id, 'quantity' => 3],
        ]))->assertCreated()
            ->assertJsonPath('data.items.0.product_unit.id', $box->id)
            ->assertJsonPath('data.items.0.quantity', 3)
            ->assertJsonPath('data.items.0.base_quantity', 36);

        $importId = $created->json('data.id');
        $this->assertDatabaseHas('stock_import_items', [
            'stock_import_id' => $importId,
            'product_unit_id' => $box->id,
            'quantity' => 3,
            'base_quantity' => 36,
        ]);

        $this->withHeader('Idempotency-Key', 'post-unit-import')
            ->postJson("/api/admin/stock-imports/{$importId}/post")
            ->assertOk();

        $this->assertDatabaseHas('warehouse_inventories', [
            'warehouse_id' => $warehouse->id,
            'product_id' => $product->id,
            'quantity' => 36,
        ]);
        $this->assertDatabaseHas('stock_movements', [
            'source_type' => 'stock_import',
            'source_id' => $importId,
            'quantity' => 36,
        ]);
    }

    public function test_void_import_restores_balance_and_preserves_both_ledger_entries(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $product = Product::factory()->create();
        $import = $this->createImport($admin, $warehouse, [['product_id' => $product->id, 'quantity' => 25]]);
        $this->withHeader('Idempotency-Key', 'post')->postJson("/api/admin/stock-imports/{$import->id}/post")->assertOk();

        $this->withHeader('Idempotency-Key', 'void')->postJson("/api/admin/stock-imports/{$import->id}/void", ['reason' => 'Supplier delivery was duplicated.'])
            ->assertOk()->assertJsonPath('data.status', 'voided')->assertJsonPath('data.void_reason', 'Supplier delivery was duplicated.');
        $this->assertSame(0, WarehouseInventory::query()->sole()->quantity);
        $this->assertEqualsCanonicalizing(['IMPORT_IN', 'REVERSAL_OUT'], StockMovement::query()->get()->map(fn (StockMovement $movement) => $movement->movement_type->value)->all());
        $this->assertDatabaseHas('audit_logs', ['event' => 'stock_import.voided', 'subject_id' => $import->id]);
        $this->withHeader('Idempotency-Key', 'void')->postJson("/api/admin/stock-imports/{$import->id}/void", ['reason' => 'Supplier delivery was duplicated.'])->assertOk();
        $this->assertSame(2, StockMovement::query()->count());
    }

    public function test_decrease_adjustment_cannot_make_stock_negative_and_failed_post_is_atomic(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $product = Product::factory()->create();
        WarehouseInventory::query()->create(['warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'quantity' => 5]);
        $adjustment = $this->createAdjustment($admin, $warehouse, $product, ['adjustment_type' => 'decrease', 'quantity' => 6]);

        $this->withHeader('Idempotency-Key', 'too-much')->postJson("/api/admin/stock-adjustments/{$adjustment->id}/post")
            ->assertConflict()->assertJsonPath('code', 'INSUFFICIENT_WAREHOUSE_STOCK')
            ->assertJsonPath('details.available', 5);
        $this->assertSame(5, WarehouseInventory::query()->sole()->quantity);
        $this->assertDatabaseHas('stock_adjustments', ['id' => $adjustment->id, 'status' => 'draft']);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'stock_adjustment.posted', 'subject_id' => $adjustment->id]);
    }

    public function test_adjustments_require_reason_and_post_each_direction_once(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $product = Product::factory()->create();
        $this->actingAs($admin)->postJson('/api/admin/stock-adjustments', $this->adjustmentPayload($warehouse, $product, ['reason' => '']))
            ->assertUnprocessable()->assertJsonValidationErrors('reason');

        $increase = $this->createAdjustment($admin, $warehouse, $product, ['adjustment_type' => 'increase', 'quantity' => 20]);
        $this->withHeader('Idempotency-Key', 'increase')->postJson("/api/admin/stock-adjustments/{$increase->id}/post")->assertOk();
        $decrease = $this->createAdjustment($admin, $warehouse, $product, ['adjustment_type' => 'decrease', 'quantity' => 7]);
        $this->withHeader('Idempotency-Key', 'decrease')->postJson("/api/admin/stock-adjustments/{$decrease->id}/post")->assertOk();
        $this->assertSame(13, WarehouseInventory::query()->sole()->quantity);
        $this->assertEqualsCanonicalizing(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'], StockMovement::query()->get()->map(fn (StockMovement $movement) => $movement->movement_type->value)->all());
        $this->assertSame(2, AuditLog::query()->where('event', 'stock_adjustment.posted')->count());
        $this->withHeader('Idempotency-Key', 'decrease')->postJson("/api/admin/stock-adjustments/{$decrease->id}/post")->assertOk();
        $this->assertSame(13, WarehouseInventory::query()->sole()->quantity);
    }

    public function test_inventory_history_is_warehouse_scoped_filterable_and_reconciles_to_balance(): void
    {
        $viewer = $this->officeUser(PermissionName::InventoryView);
        $assigned = Warehouse::factory()->create();
        $foreign = Warehouse::factory()->create();
        $viewer->warehouses()->attach($assigned, ['assigned_by' => $viewer->id]);
        $product = Product::factory()->create();
        $admin = $this->superAdmin();
        $assignedImport = $this->createImport($admin, $assigned, [['product_id' => $product->id, 'quantity' => 11]]);
        $foreignImport = $this->createImport($admin, $foreign, [['product_id' => $product->id, 'quantity' => 99]]);
        $this->actingAs($admin)->withHeader('Idempotency-Key', 'assigned')->postJson("/api/admin/stock-imports/{$assignedImport->id}/post")->assertOk();
        $this->withHeader('Idempotency-Key', 'foreign')->postJson("/api/admin/stock-imports/{$foreignImport->id}/post")->assertOk();

        $this->actingAs($viewer)->getJson("/api/admin/inventory?warehouse_id={$assigned->id}&product_id={$product->id}&stock=positive")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.quantity', 11);
        $this->getJson("/api/admin/inventory/movements?warehouse_id={$assigned->id}&product_id={$product->id}&movement_type=IMPORT_IN&reference={$assignedImport->reference}")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.actor.id', $admin->id)
            ->assertJsonPath('data.0.source.type', 'stock_import');
        $this->getJson("/api/admin/inventory?warehouse_id={$foreign->id}")->assertForbidden();
        $this->getJson("/api/admin/inventory/movements?warehouse_id={$foreign->id}")->assertForbidden();

        $net = StockMovement::query()->where('product_id', $product->id)
            ->where(fn ($query) => $query->where('to_location_id', $assigned->id)->orWhere('from_location_id', $assigned->id))
            ->get()->sum(fn (StockMovement $movement) => $movement->to_location_id === $assigned->id ? $movement->quantity : -$movement->quantity);
        $this->assertSame(WarehouseInventory::query()->where('warehouse_id', $assigned->id)->where('product_id', $product->id)->value('quantity'), $net);
    }

    public function test_read_import_and_adjust_permissions_are_separate_and_warehouse_scoped(): void
    {
        $warehouse = Warehouse::factory()->create();
        $foreign = Warehouse::factory()->create();
        $product = Product::factory()->create();
        $viewer = $this->officeUser(PermissionName::InventoryView);
        $viewer->warehouses()->attach($warehouse, ['assigned_by' => $viewer->id]);
        $this->actingAs($viewer)->getJson('/api/admin/inventory')->assertOk();
        $this->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [['product_id' => $product->id, 'quantity' => 1]]))->assertForbidden();
        $this->postJson('/api/admin/stock-adjustments', $this->adjustmentPayload($warehouse, $product))->assertForbidden();

        $importer = $this->officeUser(PermissionName::InventoryImport);
        $importer->warehouses()->attach($warehouse, ['assigned_by' => $importer->id]);
        $this->actingAs($importer)->postJson('/api/admin/stock-imports', $this->importPayload($foreign, [['product_id' => $product->id, 'quantity' => 1]]))->assertForbidden();
        $this->getJson('/api/admin/inventory')->assertForbidden();
        $adjuster = $this->officeUser(PermissionName::InventoryAdjust);
        $adjuster->warehouses()->attach($warehouse, ['assigned_by' => $adjuster->id]);
        $this->actingAs($adjuster)->postJson('/api/admin/stock-adjustments', $this->adjustmentPayload($foreign, $product))->assertForbidden();
    }

    public function test_drafts_reject_inactive_or_duplicate_master_data_and_recheck_before_posting(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $inactiveWarehouse = Warehouse::factory()->inactive()->create();
        $product = Product::factory()->create();
        $inactiveProduct = Product::factory()->inactive()->create();

        $this->actingAs($admin)->postJson('/api/admin/stock-imports', $this->importPayload($inactiveWarehouse, [['product_id' => $product->id, 'quantity' => 1]]))
            ->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
        $this->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [['product_id' => $inactiveProduct->id, 'quantity' => 1]]))
            ->assertUnprocessable()->assertJsonValidationErrors('items.0.product_id');
        $this->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, [
            ['product_id' => $product->id, 'quantity' => 1],
            ['product_id' => $product->id, 'quantity' => 2],
        ]))->assertUnprocessable()->assertJsonValidationErrors('items.0.product_id');

        $import = $this->createImport($admin, $warehouse, [['product_id' => $product->id, 'quantity' => 4]]);
        $product->update(['is_active' => false]);
        $this->withHeader('Idempotency-Key', 'inactive-at-post')->postJson("/api/admin/stock-imports/{$import->id}/post")
            ->assertConflict()->assertJsonPath('code', 'INACTIVE_MASTER_DATA');
        $this->assertDatabaseCount('warehouse_inventories', 0);
        $this->assertDatabaseCount('stock_movements', 0);
    }

    private function createImport(User $user, Warehouse $warehouse, array $items): StockImport
    {
        $id = $this->actingAs($user)->postJson('/api/admin/stock-imports', $this->importPayload($warehouse, $items))->assertCreated()->json('data.id');

        return StockImport::query()->findOrFail($id);
    }

    private function createAdjustment(User $user, Warehouse $warehouse, Product $product, array $overrides = []): StockAdjustment
    {
        $id = $this->actingAs($user)->postJson('/api/admin/stock-adjustments', $this->adjustmentPayload($warehouse, $product, $overrides))->assertCreated()->json('data.id');

        return StockAdjustment::query()->findOrFail($id);
    }

    private function importPayload(Warehouse $warehouse, array $items): array
    {
        return ['warehouse_id' => $warehouse->id, 'notes' => 'Opening delivery.', 'items' => $items];
    }

    private function adjustmentPayload(Warehouse $warehouse, Product $product, array $overrides = []): array
    {
        return array_merge([
            'warehouse_id' => $warehouse->id,
            'product_id' => $product->id,
            'adjustment_type' => 'increase',
            'quantity' => 5,
            'reason' => 'Verified physical count difference.',
            'notes' => null,
        ], $overrides);
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SuperAdmin->value);

        return $user;
    }

    private function officeUser(PermissionName ...$permissions): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);
        $user->givePermissionTo(collect($permissions)->map->value->all());

        return $user;
    }
}
