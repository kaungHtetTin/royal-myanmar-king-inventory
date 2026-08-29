<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\CustomerCreditTransaction;
use App\Models\Product;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeCashTransaction;
use App\Models\RepresentativeInventory;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Phase5SalesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_draft_is_server_priced_stock_neutral_editable_and_numbered(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(20, 1250);
        $created = $this->actingAs($user)->withHeader('Idempotency-Key', 'draft-one')->postJson('/api/sales/sales', $this->payload($customer, $product, 3, 'cash'))
            ->assertCreated()->assertJsonPath('data.reference', 'SAL-000001')->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.items.0.unit_price', 1250)->assertJsonPath('data.items.0.line_total', 3750)->assertJsonPath('data.total_amount', 3750)
            ->assertJsonPath('data.creation_location.latitude', 16.8409)->assertJsonPath('data.creation_location.longitude', 96.1735)
            ->assertJsonPath('data.creation_location.accuracy_meters', 12);
        $saleId = $created->json('data.id');
        $this->assertRepresentativeQuantity($representative, $product, 20);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseCount('representative_cash_transactions', 0);

        $product->update(['selling_price' => 1500]);
        $relocated = $this->payload($customer, $product, 2, 'cash', false) + [
            'creation_latitude' => 1.3521,
            'creation_longitude' => 103.8198,
        ];
        $this->putJson("/api/sales/sales/{$saleId}", $relocated)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['creation_latitude', 'creation_longitude']);
        $this->assertDatabaseHas('sales', [
            'id' => $saleId,
            'creation_latitude' => 16.8409,
            'creation_longitude' => 96.1735,
        ]);
        $this->putJson("/api/sales/sales/{$saleId}", $this->payload($customer, $product, 2, 'cash', false))
            ->assertOk()->assertJsonPath('data.items.0.unit_price', 1500)->assertJsonPath('data.total_amount', 3000);
        $this->withHeader('Idempotency-Key', 'draft-two')->postJson('/api/sales/sales', $this->payload($customer, $product, 1, 'cash'))->assertCreated()->assertJsonPath('data.reference', 'SAL-000002');
        $product->update(['is_active' => false]);
        $this->withHeader('Idempotency-Key', 'draft-two')->postJson('/api/sales/sales', $this->payload($customer, $product, 1, 'cash'))->assertCreated()->assertJsonPath('data.reference', 'SAL-000002');
        $this->assertDatabaseCount('sales', 2);
    }

    public function test_new_sale_requires_valid_device_coordinates(): void
    {
        [, $user, $customer, $product] = $this->fixture(20, 1250);
        $payload = $this->payload($customer, $product, 1, 'cash');
        unset($payload['creation_latitude']);
        $payload['creation_longitude'] = 181;

        $this->actingAs($user)->withHeader('Idempotency-Key', 'invalid-location')->postJson('/api/sales/sales', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['creation_latitude', 'creation_longitude']);
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_cash_sale_deducts_stock_and_increases_cash_exactly_once(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(20, 1000);
        $sale = $this->createSale($user, $customer, $product, 5, 'cash');
        $product->update(['selling_price' => 2000]);
        $this->actingAs($user);
        $this->command("/api/sales/sales/{$sale->id}/post", 'cash-post')->assertOk()->assertJsonPath('data.status', 'posted');
        $this->assertRepresentativeQuantity($representative, $product, 15);
        $this->assertSame(5000, RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount'));
        $this->assertDatabaseHas('representative_cash_transactions', ['transaction_type' => 'cash_sale', 'amount_delta' => 5000, 'reference' => $sale->reference]);
        $this->assertDatabaseHas('stock_movements', ['movement_type' => 'SALE_OUT', 'quantity' => 5, 'reference' => $sale->reference]);

        $this->command("/api/sales/sales/{$sale->id}/post", 'cash-post')->assertOk();
        $this->assertRepresentativeQuantity($representative, $product, 15);
        $this->assertDatabaseCount('representative_cash_transactions', 1);
        $this->command("/api/sales/sales/{$sale->id}/post", 'cash-post-new')->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
    }

    public function test_credit_sale_requires_permission_and_available_credit(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(30, 1000, false, 0);
        $disabled = $this->createSale($user, $customer, $product, 5, 'credit');
        $this->actingAs($user);
        $this->command("/api/sales/sales/{$disabled->id}/post", 'credit-disabled')->assertConflict()->assertJsonPath('code', 'CUSTOMER_CREDIT_DISABLED');
        $this->assertRepresentativeQuantity($representative, $product, 30);

        $customer->update(['credit_allowed' => true, 'credit_limit' => 6000]);
        CustomerCreditBalance::query()->create(['customer_id' => $customer->id, 'outstanding_amount' => 2000]);
        $this->command("/api/sales/sales/{$disabled->id}/post", 'credit-over')->assertConflict()->assertJsonPath('code', 'CUSTOMER_CREDIT_LIMIT_EXCEEDED')->assertJsonPath('details.available_credit', 4000);
        $this->assertSame(2000, CustomerCreditBalance::query()->where('customer_id', $customer->id)->value('outstanding_amount'));

        $customer->update(['credit_limit' => 7000]);
        $this->command("/api/sales/sales/{$disabled->id}/post", 'credit-valid')->assertOk()->assertJsonPath('data.status', 'posted');
        $this->assertRepresentativeQuantity($representative, $product, 25);
        $this->assertSame(7000, CustomerCreditBalance::query()->where('customer_id', $customer->id)->value('outstanding_amount'));
        $this->assertDatabaseHas('customer_credit_transactions', ['transaction_type' => 'credit_sale', 'amount_delta' => 5000]);
        $this->assertDatabaseCount('representative_cash_transactions', 0);
    }

    public function test_insufficient_line_rolls_back_every_stock_and_financial_effect(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(20, 1000);
        $other = Product::factory()->create(['selling_price' => 2000]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $other->id, 'quantity' => 2]);
        $saleId = $this->actingAs($user)->withHeader('Idempotency-Key', 'rollback-draft')->postJson('/api/sales/sales', ['customer_id' => $customer->id, 'payment_type' => 'cash', 'creation_latitude' => 16.8409, 'creation_longitude' => 96.1735, 'location_accuracy_meters' => 12, 'items' => [['product_id' => $product->id, 'quantity' => 5], ['product_id' => $other->id, 'quantity' => 3]]])->assertCreated()->json('data.id');
        $this->command("/api/sales/sales/{$saleId}/post", 'rollback-sale')->assertConflict()->assertJsonPath('code', 'INSUFFICIENT_REPRESENTATIVE_STOCK');
        $this->assertRepresentativeQuantity($representative, $product, 20);
        $this->assertRepresentativeQuantity($representative, $other, 2);
        $this->assertDatabaseHas('sales', ['id' => $saleId, 'status' => 'draft']);
        $this->assertDatabaseCount('stock_movements', 0);
        $this->assertDatabaseCount('representative_cash_balances', 0);
    }

    public function test_posted_sale_is_immutable_and_void_creates_compensating_entries(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(20, 1000);
        $sale = $this->createSale($user, $customer, $product, 5, 'cash');
        $this->actingAs($user);
        $this->command("/api/sales/sales/{$sale->id}/post", 'post-before-void')->assertOk();
        $this->putJson("/api/sales/sales/{$sale->id}", $this->payload($customer, $product, 1, 'cash', false))->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
        $this->deleteJson("/api/sales/sales/{$sale->id}")->assertMethodNotAllowed();

        $admin = $this->superAdmin();
        $this->actingAs($admin);
        $this->command("/api/admin/sales/{$sale->id}/void", 'void-cash', ['reason' => 'Customer returned the complete order.'])->assertOk()->assertJsonPath('data.status', 'voided');
        $this->assertRepresentativeQuantity($representative, $product, 20);
        $this->assertSame(0, RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount'));
        $this->assertSame([5000, -5000], RepresentativeCashTransaction::query()->orderBy('id')->pluck('amount_delta')->all());
        $cashTransactions = RepresentativeCashTransaction::query()->orderBy('id')->get();
        $this->assertSame($cashTransactions[0]->id, $cashTransactions[1]->reversal_of_id);
        $this->assertSame(['SALE_OUT', 'SALE_VOID_IN'], StockMovement::query()->orderBy('id')->pluck('movement_type')->map->value->all());
        $this->assertDatabaseHas('sales', ['id' => $sale->id, 'void_reason' => 'Customer returned the complete order.']);
        $this->command("/api/admin/sales/{$sale->id}/void", 'void-cash', ['reason' => 'Customer returned the complete order.'])->assertOk();
        $this->assertDatabaseCount('representative_cash_transactions', 2);
    }

    public function test_credit_void_restores_stock_and_outstanding_credit(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(20, 1000, true, 10000);
        $sale = $this->createSale($user, $customer, $product, 4, 'credit');
        $this->actingAs($user);
        $this->command("/api/sales/sales/{$sale->id}/post", 'credit-post')->assertOk();
        $this->actingAs($this->superAdmin());
        $this->command("/api/admin/sales/{$sale->id}/void", 'credit-void', ['reason' => 'Credit invoice cancelled.'])->assertOk();
        $this->assertRepresentativeQuantity($representative, $product, 20);
        $this->assertSame(0, CustomerCreditBalance::query()->where('customer_id', $customer->id)->value('outstanding_amount'));
        $this->assertSame([4000, -4000], CustomerCreditTransaction::query()->orderBy('id')->pluck('amount_delta')->all());
        $creditTransactions = CustomerCreditTransaction::query()->orderBy('id')->get();
        $this->assertSame($creditTransactions[0]->id, $creditTransactions[1]->reversal_of_id);
    }

    public function test_representative_can_only_create_and_view_own_sales(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(20, 1000);
        $sale = $this->createSale($user, $customer, $product, 2, 'cash');
        [$other, $otherUser, $otherCustomer, $otherProduct] = $this->fixture(10, 500);
        $this->actingAs($user)->getJson("/api/sales/sales/{$sale->id}")
            ->assertOk()
            ->assertJsonPath('data.reference', $sale->reference)
            ->assertJsonPath('data.items.0.quantity', 2);
        $this->actingAs($otherUser)->getJson("/api/sales/sales/{$sale->id}")->assertForbidden();
        $this->actingAs($otherUser)->getJson('/api/sales/sales')->assertOk()->assertJsonCount(0, 'data');
        $this->command("/api/sales/sales/{$sale->id}/post", 'foreign-sale')->assertForbidden();
        $this->withHeader('Idempotency-Key', 'foreign-customer')->postJson('/api/sales/sales', $this->payload($customer, $product, 1, 'cash'))->assertNotFound();
        $own = $this->createSale($otherUser, $otherCustomer, $otherProduct, 1, 'cash');
        $this->assertSame($other->id, $own->sales_representative_id);
        $this->actingAs($user)->getJson('/api/sales/sales')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.representative.id', $representative->id);
    }

    public function test_admin_sales_register_and_void_are_warehouse_scoped_and_separately_authorized(): void
    {
        [, $user, $customer, $product] = $this->fixture(20, 1000);
        $sale = $this->createSale($user, $customer, $product, 2, 'cash');
        $this->actingAs($user);
        $this->command("/api/sales/sales/{$sale->id}/post", 'scoped-post')->assertOk();
        $viewer = $this->officeUser(PermissionName::SaleView);
        $viewer->warehouses()->attach($sale->warehouse_id, ['assigned_by' => $viewer->id]);
        $this->actingAs($viewer)->getJson('/api/admin/sales')->assertOk()->assertJsonCount(1, 'data');
        $oldSale = $this->createSale($user, $customer, $product, 1, 'credit');
        $oldSale->forceFill(['created_at' => now()->subDays(45)])->save();
        $this->actingAs($viewer);
        $this->getJson('/api/admin/sales?period=today')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $sale->id);
        $this->getJson('/api/admin/sales?period=30_days')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/admin/sales?date_from='.today()->toDateString().'&date_to='.today()->toDateString())
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $sale->id);
        $this->getJson('/api/admin/sales?date_from='.today()->toDateString().'&date_to='.today()->subDay()->toDateString())
            ->assertUnprocessable();
        $this->getJson('/api/admin/sales')->assertOk()->assertJsonCount(2, 'data');
        $this->command("/api/admin/sales/{$sale->id}/void", 'viewer-void', ['reason' => 'Not authorized.'])->assertForbidden();

        $voider = $this->officeUser(PermissionName::SaleView, PermissionName::SaleVoid);
        $foreignWarehouse = Warehouse::factory()->create();
        $voider->warehouses()->attach($foreignWarehouse, ['assigned_by' => $voider->id]);
        $this->actingAs($voider)->getJson('/api/admin/sales')->assertOk()->assertJsonCount(0, 'data');
        $this->command("/api/admin/sales/{$sale->id}/void", 'foreign-void', ['reason' => 'Wrong scope.'])->assertForbidden();
    }

    public function test_sale_options_are_current_active_and_warehouse_scoped(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(20, 1000, true, 10000);
        CustomerCreditBalance::query()->create(['customer_id' => $customer->id, 'outstanding_amount' => 2500]);
        RepresentativeCashBalance::query()->create(['sales_representative_id' => $representative->id, 'amount' => 4000]);
        $this->actingAs($user)->getJson('/api/sales/sale-options')->assertOk()->assertJsonPath('cash_hold', 4000)->assertJsonPath('customers.0.available_credit', 7500)->assertJsonPath('products.0.quantity', 20)->assertJsonPath('products.0.selling_price', 1000);
        $product->update(['is_active' => false]);
        $customer->update(['is_active' => false]);
        $this->getJson('/api/sales/sale-options')->assertOk()->assertJsonCount(0, 'customers')->assertJsonCount(0, 'products');
    }

    public function test_representative_can_create_cash_only_customer_for_own_warehouse(): void
    {
        [$representative, $user] = $this->fixture(20, 1000);
        $foreignWarehouse = Warehouse::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/sales/customers', [
            'name' => ' New Route Shop ',
            'customer_type' => 'Shop',
            'phone' => '09-111222333',
            'region' => 'Yangon',
            'township' => 'Hlaing',
            'address' => 'Main Road',
            'notes' => 'Created on route.',
            'warehouse_id' => $foreignWarehouse->id,
            'credit_allowed' => true,
            'credit_limit' => 500000,
        ]);

        $response->assertCreated()
            ->assertJsonPath('customer.code', 'CUS-000001')
            ->assertJsonPath('customer.name', 'New Route Shop')
            ->assertJsonPath('customer.credit_allowed', false)
            ->assertJsonPath('customer.credit_limit', 0);
        $this->assertDatabaseHas('customers', [
            'id' => $response->json('customer.id'),
            'warehouse_id' => $representative->primary_warehouse_id,
            'credit_allowed' => false,
            'credit_limit' => 0,
            'is_active' => true,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'event' => 'customer.created',
            'actor_id' => $user->id,
            'subject_id' => $response->json('customer.id'),
        ]);
        Customer::factory()->create(['warehouse_id' => $foreignWarehouse->id, 'name' => 'Foreign Shop']);
        $this->getJson('/api/sales/customers?search=Route')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $response->json('customer.id'))
            ->assertJsonPath('data.0.way.region.name', 'Sales Region')
            ->assertJsonPath('data.0.way.region.warehouse.id', $representative->primary_warehouse_id)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_stock_cash_and_credit_balances_reconcile_to_append_only_ledgers(): void
    {
        [$representative, $user, $customer, $product] = $this->fixture(30, 1000, true, 20000);
        $cash = $this->createSale($user, $customer, $product, 5, 'cash');
        $credit = $this->createSale($user, $customer, $product, 7, 'credit');
        $this->actingAs($user);
        $this->command("/api/sales/sales/{$cash->id}/post", 'reconcile-cash')->assertOk();
        $this->command("/api/sales/sales/{$credit->id}/post", 'reconcile-credit')->assertOk();
        $this->assertRepresentativeQuantity($representative, $product, 18);
        $this->assertSame(12, StockMovement::query()->where('movement_type', 'SALE_OUT')->sum('quantity'));
        $this->assertSame(5000, RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount'));
        $this->assertSame(5000, RepresentativeCashTransaction::query()->where('sales_representative_id', $representative->id)->sum('amount_delta'));
        $this->assertSame(7000, CustomerCreditBalance::query()->where('customer_id', $customer->id)->value('outstanding_amount'));
        $this->assertSame(7000, CustomerCreditTransaction::query()->where('customer_id', $customer->id)->sum('amount_delta'));
    }

    /** @return array{SalesRepresentative, User, Customer, Product} */
    private function fixture(int $quantity, int $price, bool $creditAllowed = true, int $creditLimit = 100000): array
    {
        $warehouse = Warehouse::factory()->create();
        $region = $warehouse->regions()->create(['name' => 'Sales Region', 'is_active' => true]);
        $way = $region->ways()->create(['code' => 'WAY-SALES-'.$warehouse->id, 'name' => 'Sales Route', 'is_active' => true]);
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::factory()->create(['user_id' => $user->id, 'primary_warehouse_id' => $warehouse->id]);
        $representative->regions()->sync([$region->id]);
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'way_id' => $way->id, 'credit_allowed' => $creditAllowed, 'credit_limit' => $creditLimit]);
        $product = Product::factory()->create(['selling_price' => $price]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $product->id, 'quantity' => $quantity]);

        return [$representative, $user, $customer, $product];
    }

    private function createSale(User $user, Customer $customer, Product $product, int $quantity, string $paymentType): Sale
    {
        $id = $this->actingAs($user)->withHeader('Idempotency-Key', fake()->uuid())->postJson('/api/sales/sales', $this->payload($customer, $product, $quantity, $paymentType))->assertCreated()->json('data.id');

        return Sale::query()->findOrFail($id);
    }

    private function payload(Customer $customer, Product $product, int $quantity, string $paymentType, bool $withLocation = true): array
    {
        return array_filter(['customer_id' => $customer->id, 'payment_type' => $paymentType, 'notes' => 'Sale test.', 'creation_latitude' => $withLocation ? 16.8409 : null, 'creation_longitude' => $withLocation ? 96.1735 : null, 'location_accuracy_meters' => $withLocation ? 12 : null, 'items' => [['product_id' => $product->id, 'quantity' => $quantity]]], fn ($value) => $value !== null);
    }

    private function command(string $uri, string $key, array $payload = [])
    {
        return $this->withHeader('Idempotency-Key', $key)->postJson($uri, $payload);
    }

    private function assertRepresentativeQuantity(SalesRepresentative $representative, Product $product, int $quantity): void
    {
        $this->assertSame($quantity, (int) RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->where('product_id', $product->id)->value('quantity'));
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
