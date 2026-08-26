<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\AuditLog;
use App\Models\InTransitInventory;
use App\Models\Product;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Models\WarehouseTransfer;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Phase4TransferTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_warehouse_draft_is_stock_neutral_editable_cancellable_and_numbered(): void
    {
        $admin = $this->superAdmin();
        [$source, $destination, $product] = $this->warehouseFixture(50);
        $created = $this->actingAs($admin)->postJson('/api/admin/warehouse-transfers', $this->warehousePayload($source, $destination, $product, 10))
            ->assertCreated()->assertJsonPath('data.reference', 'WTR-000001')->assertJsonPath('data.status', 'draft');
        $transferId = $created->json('data.id');
        $this->getJson("/api/admin/warehouse-transfers/{$transferId}")
            ->assertOk()
            ->assertJsonPath('data.id', $transferId)
            ->assertJsonPath('data.items.0.product.id', $product->id);
        $this->assertSame(50, WarehouseInventory::query()->where('warehouse_id', $source->id)->value('quantity'));
        $this->assertDatabaseCount('in_transit_inventories', 0);
        $this->assertDatabaseCount('stock_movements', 0);

        $this->putJson("/api/admin/warehouse-transfers/{$transferId}", $this->warehousePayload($source, $destination, $product, 12))
            ->assertOk()->assertJsonPath('data.items.0.quantity', 12);
        $this->postJson('/api/admin/warehouse-transfers', $this->warehousePayload($source, $destination, $product, 1))
            ->assertCreated()->assertJsonPath('data.reference', 'WTR-000002');
        $this->command("/api/admin/warehouse-transfers/{$transferId}/cancel", 'cancel-wtr', ['reason' => 'Delivery plan changed.'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseHas('audit_logs', ['event' => 'warehouse_transfer.cancelled', 'subject_id' => $transferId]);
    }

    public function test_warehouse_dispatch_and_receive_move_stock_through_explicit_transit_once(): void
    {
        $admin = $this->superAdmin();
        [$source, $destination, $product] = $this->warehouseFixture(50);
        $transfer = $this->createWarehouseTransfer($admin, $source, $destination, $product, 20);

        $this->actingAs($admin);
        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/dispatch", 'dispatch-wtr')->assertOk()->assertJsonPath('data.status', 'dispatched')->assertJsonPath('data.items.0.in_transit_quantity', 20);
        $this->assertWarehouseQuantity($source, $product, 30);
        $this->assertWarehouseQuantity($destination, $product, 0);
        $this->assertSame(20, InTransitInventory::query()->sole()->quantity);
        $this->assertDatabaseHas('stock_movements', ['movement_type' => 'WAREHOUSE_TRANSFER_DISPATCH', 'from_location_id' => $source->id, 'to_location_type' => 'in_transit', 'quantity' => 20]);

        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/receive", 'receive-wtr')->assertOk()->assertJsonPath('data.status', 'received')->assertJsonPath('data.items.0.in_transit_quantity', 0);
        $this->assertWarehouseQuantity($source, $product, 30);
        $this->assertWarehouseQuantity($destination, $product, 20);
        $this->assertSame(0, InTransitInventory::query()->sole()->quantity);
        $this->assertDatabaseHas('stock_movements', ['movement_type' => 'WAREHOUSE_TRANSFER_RECEIVE', 'from_location_type' => 'in_transit', 'to_location_id' => $destination->id, 'quantity' => 20]);
        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/receive", 'receive-wtr')->assertOk();
        $this->assertSame(2, StockMovement::query()->count());

        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/receive", 'receive-wtr-again')->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
    }

    public function test_warehouse_dispatch_rejects_insufficient_stock_atomically(): void
    {
        $admin = $this->superAdmin();
        [$source, $destination, $product] = $this->warehouseFixture(50);
        $transfer = $this->createWarehouseTransfer($admin, $source, $destination, $product, 60);

        $this->actingAs($admin);
        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/dispatch", 'too-much')->assertConflict()->assertJsonPath('code', 'INSUFFICIENT_WAREHOUSE_STOCK');
        $this->assertWarehouseQuantity($source, $product, 50);
        $this->assertDatabaseHas('warehouse_transfers', ['id' => $transfer->id, 'status' => 'draft']);
        $this->assertDatabaseCount('in_transit_inventories', 0);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseMissing('audit_logs', ['event' => 'warehouse_transfer.dispatched', 'subject_id' => $transfer->id]);
    }

    public function test_warehouse_reversal_restores_dispatched_or_received_stock_with_history(): void
    {
        $admin = $this->superAdmin();
        [$source, $destination, $product] = $this->warehouseFixture(100);
        $dispatched = $this->createWarehouseTransfer($admin, $source, $destination, $product, 20);
        $this->actingAs($admin);
        $this->command("/api/admin/warehouse-transfers/{$dispatched->id}/dispatch", 'dispatch-1')->assertOk();
        $this->command("/api/admin/warehouse-transfers/{$dispatched->id}/reverse", 'reverse-1', ['reason' => 'Vehicle returned before delivery.'])->assertOk()->assertJsonPath('data.status', 'reversed');
        $this->assertWarehouseQuantity($source, $product, 100);
        $this->assertSame(0, InTransitInventory::query()->where('transfer_id', $dispatched->id)->value('quantity'));

        $received = $this->createWarehouseTransfer($admin, $source, $destination, $product, 30);
        $this->command("/api/admin/warehouse-transfers/{$received->id}/dispatch", 'dispatch-2')->assertOk();
        $this->command("/api/admin/warehouse-transfers/{$received->id}/receive", 'receive-2')->assertOk();
        $this->command("/api/admin/warehouse-transfers/{$received->id}/reverse", 'reverse-2', ['reason' => 'Destination rejected the shipment.'])->assertOk()->assertJsonPath('data.status', 'reversed');
        $this->assertWarehouseQuantity($source, $product, 100);
        $this->assertWarehouseQuantity($destination, $product, 0);
        $this->assertSame(2, StockMovement::query()->where('movement_type', 'REVERSAL_IN')->count());
        $this->assertSame(2, AuditLog::query()->where('event', 'warehouse_transfer.reversed')->count());
    }

    public function test_warehouse_permissions_are_separate_at_source_and_destination_stages(): void
    {
        [$source, $destination, $product] = $this->warehouseFixture(50);
        $creator = $this->officeUser(PermissionName::WarehouseTransferView, PermissionName::WarehouseTransferCreate, PermissionName::WarehouseTransferDispatch, PermissionName::WarehouseTransferReceive);
        $creator->warehouses()->attach($source, ['assigned_by' => $creator->id]);
        $transfer = $this->createWarehouseTransfer($creator, $source, $destination, $product, 10);
        $this->actingAs($creator);
        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/dispatch", 'scoped-dispatch')->assertOk();
        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/receive", 'wrong-destination')->assertForbidden();

        $receiver = $this->officeUser(PermissionName::WarehouseTransferView, PermissionName::WarehouseTransferReceive);
        $receiver->warehouses()->attach($destination, ['assigned_by' => $receiver->id]);
        $this->actingAs($receiver);
        $this->getJson('/api/admin/warehouse-transfers')->assertOk()->assertJsonCount(1, 'data');
        $this->command("/api/admin/warehouse-transfers/{$transfer->id}/receive", 'scoped-receive')->assertOk();
    }

    public function test_representative_inventory_has_no_artificial_per_product_capacity_limit(): void
    {
        $admin = $this->superAdmin();
        [$warehouse, , $product] = $this->warehouseFixture(250);
        [$representative] = $this->representative($warehouse);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $product->id, 'quantity' => 80]);

        $first = $this->createRepresentativeTransfer($admin, $warehouse, $representative, $product, 30);
        $this->actingAs($admin);
        $this->command("/api/admin/representative-transfers/{$first->id}/dispatch", 'unlimited-110')->assertOk();
        $second = $this->createRepresentativeTransfer($admin, $warehouse, $representative, $product, 20);
        $this->command("/api/admin/representative-transfers/{$second->id}/dispatch", 'unlimited-130')->assertOk()->assertJsonPath('data.status', 'dispatched');
        $this->assertWarehouseQuantity($warehouse, $product, 200);
        $this->assertSame(80, RepresentativeInventory::query()->sole()->quantity);
        $this->assertSame(50, InTransitInventory::query()->where('transfer_type', 'representative_transfer')->sum('quantity'));
    }

    public function test_multiple_pending_transfers_are_allowed_when_warehouse_stock_is_available(): void
    {
        $admin = $this->superAdmin();
        [$warehouse, , $product] = $this->warehouseFixture(250);
        [$representative] = $this->representative($warehouse);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $product->id, 'quantity' => 60]);
        $pending = $this->createRepresentativeTransfer($admin, $warehouse, $representative, $product, 30);
        $this->actingAs($admin);
        $this->command("/api/admin/representative-transfers/{$pending->id}/dispatch", 'pending-30')->assertOk();
        $new = $this->createRepresentativeTransfer($admin, $warehouse, $representative, $product, 20);
        $this->command("/api/admin/representative-transfers/{$new->id}/dispatch", 'pending-over-limit')
            ->assertOk();
        $this->assertDatabaseHas('representative_transfers', ['id' => $new->id, 'status' => 'dispatched']);
    }

    public function test_only_linked_representative_can_receive_immutable_transfer_once(): void
    {
        $admin = $this->superAdmin();
        [$warehouse, , $product] = $this->warehouseFixture(100);
        [$representative, $user] = $this->representative($warehouse);
        [, $otherUser] = $this->representative($warehouse);
        $transfer = $this->createRepresentativeTransfer($admin, $warehouse, $representative, $product, 25);
        $this->actingAs($admin);
        $this->command("/api/admin/representative-transfers/{$transfer->id}/dispatch", 'rep-dispatch')->assertOk();
        $this->putJson("/api/admin/representative-transfers/{$transfer->id}", $this->representativePayload($warehouse, $representative, $product, 1))
            ->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');

        $this->actingAs($otherUser);
        $this->command("/api/sales/receivings/{$transfer->id}/receive", 'other-receive')->assertForbidden();
        $this->actingAs($user)->getJson('/api/sales/receivings')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.items.0.quantity', 25);
        $this->postJson("/api/sales/receivings/{$transfer->id}/reject", ['reason' => 'Not allowed'])
            ->assertNotFound();
        $this->command("/api/sales/receivings/{$transfer->id}/receive", 'own-receive')->assertOk()->assertJsonPath('data.status', 'received');
        $this->getJson('/api/sales/receiving-history')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.reference', $transfer->reference)
            ->assertJsonPath('data.0.status', 'received');
        $this->getJson("/api/sales/receivings/{$transfer->id}")->assertOk()
            ->assertJsonPath('data.status', 'received');
        $this->assertSame(25, RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->value('quantity'));
        $this->assertSame(0, InTransitInventory::query()->where('transfer_type', 'representative_transfer')->value('quantity'));
        $this->command("/api/sales/receivings/{$transfer->id}/receive", 'own-receive')->assertOk();
        $this->assertSame(25, RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->value('quantity'));
        $this->assertSame(2, StockMovement::query()->count());

    }

    public function test_representative_stock_is_own_read_only_and_office_scoped(): void
    {
        [$warehouse, , $product] = $this->warehouseFixture(0);
        [$representative, $user] = $this->representative($warehouse);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $product->id, 'quantity' => 40]);
        $foreignWarehouse = Warehouse::factory()->create();
        [$foreign] = $this->representative($foreignWarehouse);
        RepresentativeInventory::query()->create(['sales_representative_id' => $foreign->id, 'product_id' => $product->id, 'quantity' => 70]);

        $this->actingAs($user)->getJson('/api/sales/stock')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.quantity', 40);
        $viewer = $this->officeUser(PermissionName::RepresentativeStockView);
        $viewer->warehouses()->attach($warehouse, ['assigned_by' => $viewer->id]);
        $transfer = RepresentativeTransfer::query()->create([
            'reference' => 'RTR-DETAIL-001',
            'source_warehouse_id' => $warehouse->id,
            'sales_representative_id' => $representative->id,
            'status' => 'draft',
            'created_by' => $viewer->id,
        ]);
        $transfer->items()->create(['product_id' => $product->id, 'quantity' => 4]);
        $this->actingAs($viewer)->getJson('/api/admin/representative-inventory')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.representative.id', $representative->id);
        $this->getJson("/api/admin/representative-transfers/{$transfer->id}")
            ->assertOk()
            ->assertJsonPath('data.reference', 'RTR-DETAIL-001')
            ->assertJsonPath('data.items.0.quantity', 4);
        $this->getJson('/api/admin/representative-inventory?representative_id='.$foreign->id)->assertForbidden();
        $this->postJson('/api/admin/representative-transfers', $this->representativePayload($warehouse, $representative, $product, 1))->assertForbidden();
    }

    public function test_representative_stock_and_receivings_are_independently_paginated(): void
    {
        $warehouse = Warehouse::factory()->create();
        [$representative, $user] = $this->representative($warehouse);
        $products = Product::factory()->count(11)->create();

        foreach ($products as $index => $product) {
            RepresentativeInventory::query()->create([
                'sales_representative_id' => $representative->id,
                'product_id' => $product->id,
                'quantity' => $index + 1,
            ]);
            $transfer = RepresentativeTransfer::query()->create([
                'reference' => sprintf('PAGE-RTR-%02d', $index + 1),
                'source_warehouse_id' => $warehouse->id,
                'sales_representative_id' => $representative->id,
                'status' => 'dispatched',
                'created_by' => $user->id,
                'dispatched_by' => $user->id,
                'dispatched_at' => now(),
            ]);
            $transfer->items()->create(['product_id' => $product->id, 'quantity' => 1]);
        }

        $this->actingAs($user)->getJson('/api/sales/stock?page=2&per_page=10')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.total', 11)
            ->assertJsonPath('summary.on_hand', 66);

        $this->getJson('/api/sales/receivings?page=2&per_page=10')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.total', 11);
    }

    public function test_representative_cancel_and_reversal_preserve_documents_and_restore_stock(): void
    {
        $admin = $this->superAdmin();
        [$warehouse, , $product] = $this->warehouseFixture(100);
        [$representative] = $this->representative($warehouse);
        $cancelled = $this->createRepresentativeTransfer($admin, $warehouse, $representative, $product, 10);
        $this->actingAs($admin);
        $this->command("/api/admin/representative-transfers/{$cancelled->id}/cancel", 'rep-cancel', ['reason' => 'Route allocation changed.'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->getJson('/api/admin/representative-transfers')
            ->assertOk()
            ->assertJsonMissing(['reference' => $cancelled->reference]);
        $this->assertWarehouseQuantity($warehouse, $product, 100);

        $reversed = $this->createRepresentativeTransfer($admin, $warehouse, $representative, $product, 20);
        $this->command("/api/admin/representative-transfers/{$reversed->id}/dispatch", 'rep-dispatch-reverse')->assertOk();
        $this->command("/api/admin/representative-transfers/{$reversed->id}/reverse", 'rep-reverse', ['reason' => 'Delivery vehicle returned.'])->assertOk()->assertJsonPath('data.status', 'reversed');
        $this->assertWarehouseQuantity($warehouse, $product, 100);
        $this->assertSame(0, InTransitInventory::query()->where('transfer_id', $reversed->id)->value('quantity'));
        $this->assertDatabaseHas('representative_transfers', ['id' => $cancelled->id, 'status' => 'cancelled']);
        $this->assertDatabaseHas('representative_transfers', ['id' => $reversed->id, 'status' => 'reversed']);

        [$receivedRepresentative, $receivedUser] = $this->representative($warehouse);
        $received = $this->createRepresentativeTransfer($admin, $warehouse, $receivedRepresentative, $product, 15);
        $this->actingAs($admin);
        $this->command("/api/admin/representative-transfers/{$received->id}/dispatch", 'rep-received-dispatch')->assertOk();
        $this->actingAs($receivedUser);
        $this->command("/api/sales/receivings/{$received->id}/receive", 'rep-received-confirm')->assertOk();
        $this->actingAs($admin);
        $this->command("/api/admin/representative-transfers/{$received->id}/reverse", 'rep-received-reverse', ['reason' => 'Received batch was recalled.'])->assertOk()->assertJsonPath('data.status', 'reversed');
        $this->assertSame(0, RepresentativeInventory::query()->where('sales_representative_id', $receivedRepresentative->id)->where('product_id', $product->id)->value('quantity'));
        $this->assertWarehouseQuantity($warehouse, $product, 100);
    }

    public function test_representative_return_moves_stock_to_target_warehouse_and_can_reverse(): void
    {
        $admin = $this->superAdmin();
        [$warehouse, , $product] = $this->warehouseFixture(100);
        [$representative] = $this->representative($warehouse);
        RepresentativeInventory::query()->create([
            'sales_representative_id' => $representative->id,
            'product_id' => $product->id,
            'quantity' => 40,
        ]);

        $this->actingAs($admin)->getJson('/api/admin/representative-return-options')
            ->assertOk()
            ->assertJsonPath("products.0.representative_stock.{$representative->id}", 40);
        $created = $this->postJson('/api/admin/representative-returns', [
            'target_warehouse_id' => $warehouse->id,
            'sales_representative_id' => $representative->id,
            'notes' => 'Unsold stock return.',
            'items' => [['product_id' => $product->id, 'quantity' => 15]],
        ])->assertCreated()
            ->assertJsonPath('data.reference', 'RRT-000001')
            ->assertJsonPath('data.direction', 'return')
            ->assertJsonPath('data.status', 'draft');
        $id = $created->json('data.id');
        $this->assertWarehouseQuantity($warehouse, $product, 100);
        $this->assertSame(40, RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->value('quantity'));

        $this->command("/api/admin/representative-returns/{$id}/post", 'post-return')
            ->assertOk()->assertJsonPath('data.status', 'received');
        $this->assertWarehouseQuantity($warehouse, $product, 115);
        $this->assertSame(25, RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->value('quantity'));
        $this->assertDatabaseHas('stock_movements', ['movement_type' => 'REPRESENTATIVE_RETURN', 'quantity' => 15]);

        $this->command("/api/admin/representative-returns/{$id}/reverse", 'reverse-return', ['reason' => 'Return entered in error.'])
            ->assertOk()->assertJsonPath('data.status', 'reversed');
        $this->assertWarehouseQuantity($warehouse, $product, 100);
        $this->assertSame(40, RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->value('quantity'));
    }

    public function test_stock_total_reconciles_across_warehouse_representative_and_transit_locations(): void
    {
        $admin = $this->superAdmin();
        [$source, $destination, $product] = $this->warehouseFixture(100);
        [$representative, $user] = $this->representative($source);
        $warehouseTransfer = $this->createWarehouseTransfer($admin, $source, $destination, $product, 25);
        $representativeTransfer = $this->createRepresentativeTransfer($admin, $source, $representative, $product, 30);
        $this->actingAs($admin);
        $this->command("/api/admin/warehouse-transfers/{$warehouseTransfer->id}/dispatch", 'reconcile-wtr')->assertOk();
        $this->command("/api/admin/representative-transfers/{$representativeTransfer->id}/dispatch", 'reconcile-rtr')->assertOk();
        $this->actingAs($user);
        $this->command("/api/sales/receivings/{$representativeTransfer->id}/receive", 'reconcile-receive')->assertOk();

        $warehouseTotal = (int) WarehouseInventory::query()->where('product_id', $product->id)->sum('quantity');
        $representativeTotal = (int) RepresentativeInventory::query()->where('product_id', $product->id)->sum('quantity');
        $transitTotal = (int) InTransitInventory::query()->where('product_id', $product->id)->sum('quantity');
        $this->assertSame(100, $warehouseTotal + $representativeTotal + $transitTotal);
        $this->assertSame([45, 30, 25], [$warehouseTotal, $representativeTotal, $transitTotal]);
        $this->assertSame(3, StockMovement::query()->count());
    }

    private function warehouseFixture(int $quantity): array
    {
        $source = Warehouse::factory()->create(['code' => 'YGN-'.fake()->unique()->numerify('###')]);
        $destination = Warehouse::factory()->create(['code' => 'MDY-'.fake()->unique()->numerify('###')]);
        $product = Product::factory()->create();
        WarehouseInventory::query()->create(['warehouse_id' => $source->id, 'product_id' => $product->id, 'quantity' => $quantity]);

        return [$source, $destination, $product];
    }

    private function createWarehouseTransfer(User $user, Warehouse $source, Warehouse $destination, Product $product, int $quantity): WarehouseTransfer
    {
        $id = $this->actingAs($user)->postJson('/api/admin/warehouse-transfers', $this->warehousePayload($source, $destination, $product, $quantity))->assertCreated()->json('data.id');

        return WarehouseTransfer::query()->findOrFail($id);
    }

    private function createRepresentativeTransfer(User $user, Warehouse $warehouse, SalesRepresentative $representative, Product $product, int $quantity): RepresentativeTransfer
    {
        $id = $this->actingAs($user)->postJson('/api/admin/representative-transfers', $this->representativePayload($warehouse, $representative, $product, $quantity))->assertCreated()->json('data.id');

        return RepresentativeTransfer::query()->findOrFail($id);
    }

    private function warehousePayload(Warehouse $source, Warehouse $destination, Product $product, int $quantity): array
    {
        return ['source_warehouse_id' => $source->id, 'destination_warehouse_id' => $destination->id, 'notes' => 'Transfer test.', 'items' => [['product_id' => $product->id, 'quantity' => $quantity]]];
    }

    private function representativePayload(Warehouse $warehouse, SalesRepresentative $representative, Product $product, int $quantity): array
    {
        return ['source_warehouse_id' => $warehouse->id, 'sales_representative_id' => $representative->id, 'notes' => 'Representative issue test.', 'items' => [['product_id' => $product->id, 'quantity' => $quantity]]];
    }

    /** @return array{SalesRepresentative, User} */
    private function representative(Warehouse $warehouse): array
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::factory()->create(['user_id' => $user->id, 'primary_warehouse_id' => $warehouse->id]);

        return [$representative, $user];
    }

    private function command(string $uri, string $key, array $payload = [])
    {
        return $this->withHeader('Idempotency-Key', $key)->postJson($uri, $payload);
    }

    private function assertWarehouseQuantity(Warehouse $warehouse, Product $product, int $quantity): void
    {
        $this->assertSame($quantity, (int) (WarehouseInventory::query()->where('warehouse_id', $warehouse->id)->where('product_id', $product->id)->value('quantity') ?? 0));
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
        $user->givePermissionTo(collect($permissions)->map->value->all());

        return $user;
    }
}
