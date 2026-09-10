<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\Customer;
use App\Models\Product;
use App\Models\RepresentativeInventory;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TripManagementTest extends TestCase
{
    use RefreshDatabase;

    protected bool $useLegacyTripCompatibility = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_trip_coordinates_issue_sales_expense_partial_return_cash_and_reporting(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);
        $warehouse = Warehouse::factory()->create();
        $region = $warehouse->regions()->create(['name' => 'Trip Region', 'is_active' => true]);
        $repUser = User::factory()->create();
        $repUser->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::factory()->create(['user_id' => $repUser->id, 'primary_warehouse_id' => $warehouse->id]);
        $representative->regions()->sync([$region->id]);
        $vehicle = Vehicle::factory()->create(['sales_representative_id' => $representative->id]);
        $product = Product::factory()->create(['unit' => 'bottle', 'selling_price' => 1000, 'discount_percentage' => 10]);
        WarehouseInventory::query()->create(['warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'quantity' => 50]);
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'region_id' => $region->id, 'credit_allowed' => true, 'credit_limit' => 10000]);

        $trip = $this->actingAs($admin)->postJson('/api/admin/trips', [
            'title' => 'Downtown route', 'warehouse_id' => $warehouse->id, 'region_id' => $region->id,
            'sales_representative_id' => $representative->id, 'vehicle_id' => $vehicle->id, 'notes' => 'Morning trip.',
        ])->assertCreated()->assertJsonPath('data.status', 'planning');
        $tripId = $trip->json('data.id');

        $this->getJson('/api/admin/trips?date_from='.now()->toDateString().'&date_to='.now()->toDateString())
            ->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/admin/trips?warehouse_id='.$warehouse->id.'&region_id='.$region->id.'&representative_id='.$representative->id)
            ->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $tripId);
        $otherRegion = $warehouse->regions()->create(['name' => 'Other Region', 'is_active' => true]);
        $this->getJson('/api/admin/trips?region_id='.$otherRegion->id)
            ->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/admin/trips?date_from='.now()->addDay()->toDateString())
            ->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/admin/trips?date_from='.now()->toDateString().'&date_to='.now()->subDay()->toDateString())
            ->assertUnprocessable()->assertJsonValidationErrors('date_to');

        $this->postJson('/api/admin/trips', [
            'title' => 'Duplicate active route', 'warehouse_id' => $warehouse->id, 'region_id' => $region->id,
            'sales_representative_id' => $representative->id, 'vehicle_id' => $vehicle->id,
        ])->assertConflict()->assertJsonPath('code', 'REPRESENTATIVE_HAS_ACTIVE_TRIP');

        $this->postJson("/api/admin/trips/{$tripId}/start")
            ->assertConflict()->assertJsonPath('code', 'TRIP_STOCK_NOT_DISPATCHED');

        $issue = $this->postJson('/api/admin/representative-transfers', [
            'trip_id' => $tripId, 'source_warehouse_id' => $warehouse->id,
            'sales_representative_id' => $representative->id,
            'items' => [['product_id' => $product->id, 'quantity' => 10]],
        ])->assertCreated();
        $issueId = $issue->json('data.id');
        $this->withHeader('Idempotency-Key', 'trip-issue-dispatch')->postJson("/api/admin/representative-transfers/{$issueId}/dispatch")->assertOk();
        $this->actingAs($admin)->postJson("/api/admin/trips/{$tripId}/start")->assertOk()->assertJsonPath('data.status', 'operation');
        $this->assertDatabaseHas('representative_transfers', ['id' => $issueId, 'status' => 'received', 'received_by' => $admin->id]);
        $this->assertSame(10, (int) RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->where('product_id', $product->id)->value('quantity'));

        $deletedDraftId = $this->sale($repUser, $customer, $product, 1, 'cash', 'delete-draft');
        $this->actingAs($repUser)->deleteJson("/api/sales/sales/{$deletedDraftId}")->assertNoContent();
        $this->assertDatabaseMissing('sales', ['id' => $deletedDraftId]);
        $this->assertDatabaseMissing('sale_items', ['sale_id' => $deletedDraftId]);
        $this->assertDatabaseHas('audit_logs', ['event' => 'sale.draft_deleted', 'subject_id' => $deletedDraftId]);

        $cashSaleId = $this->actingAs($repUser)->withHeader('Idempotency-Key', 'cash-sale')->postJson('/api/sales/sales', array_replace_recursive($this->salePayload($customer, $product, 1, 'cash'), ['cashback_amount' => 40, 'items' => [['promotion_title' => 'Launch cashback', 'promotion_amount' => 60]]]))
            ->assertCreated()->assertJsonPath('data.items.0.promotion_title', 'Launch cashback')->assertJsonPath('data.items.0.promotion_amount', 60)->assertJsonPath('data.cashback_amount', 40)->assertJsonPath('data.total_amount', 800)->json('data.id');
        $this->getJson("/api/sales/sales/{$cashSaleId}")->assertOk()
            ->assertJsonPath('data.items.0.unit_price', 1000)
            ->assertJsonPath('data.items.0.discount_percentage', 10)
            ->assertJsonPath('data.items.0.discount_amount', 100)
            ->assertJsonPath('data.items.0.line_total', 840)
            ->assertJsonPath('data.merchandise_subtotal', 840)
            ->assertJsonPath('data.total_amount', 800);
        $this->actingAs($repUser)->withHeader('Idempotency-Key', 'cash-sale-post')->postJson("/api/sales/sales/{$cashSaleId}/post")->assertOk();
        $this->deleteJson("/api/sales/sales/{$cashSaleId}")->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
        $bankingSaleId = $this->sale($repUser, $customer, $product, 1, 'cash', 'banking-sale', 'banking');
        $this->withHeader('Idempotency-Key', 'banking-sale-post')->postJson("/api/sales/sales/{$bankingSaleId}/post")->assertOk();
        $creditSaleId = $this->sale($repUser, $customer, $product, 1, 'credit', 'credit-sale');
        $this->withHeader('Idempotency-Key', 'credit-sale-post')->postJson("/api/sales/sales/{$creditSaleId}/post")->assertOk();
        $this->getJson('/api/sales/sale-history-options?period=today')
            ->assertOk()->assertJsonCount(1, 'trips')->assertJsonPath('trips.0.id', $tripId);
        $this->getJson('/api/sales/sale-history-options?period=range&date_from='.today()->addDay()->toDateString().'&date_to='.today()->addDay()->toDateString())
            ->assertOk()->assertJsonCount(0, 'trips');
        $collection = $this->withHeader('Idempotency-Key', 'credit-collection')->postJson('/api/sales/credit-collections', [
            'customer_id' => $customer->id, 'amount' => 400, 'notes' => 'Partial customer payment.',
        ])->assertCreated()->assertJsonPath('outstanding_amount', 500);
        $this->assertDatabaseHas('customer_payments', [
            'id' => $collection->json('data.id'), 'trip_id' => $tripId,
            'sales_representative_id' => $representative->id, 'status' => 'posted', 'amount' => 400,
        ]);
        $this->assertDatabaseHas('representative_cash_balances', ['sales_representative_id' => $representative->id, 'amount' => 1200]);
        $bankingCollection = $this->withHeader('Idempotency-Key', 'banking-credit-collection')->postJson('/api/sales/credit-collections', [
            'customer_id' => $customer->id, 'amount' => 100, 'payment_method' => 'banking', 'notes' => 'Bank transfer received.',
        ])->assertCreated()->assertJsonPath('outstanding_amount', 400);
        $this->assertDatabaseHas('customer_payments', ['id' => $bankingCollection->json('data.id'), 'payment_method' => 'banking', 'amount' => 100]);
        $this->assertDatabaseHas('representative_cash_balances', ['sales_representative_id' => $representative->id, 'amount' => 1200]);

        $this->postJson("/api/sales/trips/{$tripId}/expenses", ['description' => 'Parking', 'amount' => 500, 'notes' => 'Market parking'])
            ->assertCreated()->assertJsonPath('expense.amount', 500);
        $this->postJson("/api/sales/trips/{$tripId}/begin-ending")->assertOk()->assertJsonPath('data.status', 'ending');
        $this->withHeader('Idempotency-Key', 'blocked-sale')->postJson('/api/sales/sales', $this->salePayload($customer, $product, 1, 'cash'))
            ->assertConflict()->assertJsonPath('code', 'NO_OPERATING_TRIP');

        $this->actingAs($admin)->postJson("/api/admin/trips/{$tripId}/complete", [
            'acknowledge_variance' => true,
            'notes' => 'Attempted forced completion.',
        ])->assertConflict()->assertJsonPath('code', 'TRIP_HAS_REMAINING_BALANCES');

        $this->actingAs($admin)->postJson('/api/admin/representative-returns', [
            'trip_id' => $tripId, 'target_warehouse_id' => $warehouse->id,
            'sales_representative_id' => $representative->id,
            'items' => [['product_id' => $product->id, 'quantity' => 6]],
        ])->assertUnprocessable()->assertJsonValidationErrors('items');

        $return = $this->actingAs($admin)->postJson('/api/admin/representative-returns', [
            'trip_id' => $tripId, 'target_warehouse_id' => $warehouse->id,
            'sales_representative_id' => $representative->id,
            'items' => [['product_id' => $product->id, 'quantity' => 7]],
        ])->assertCreated();
        $returnId = $return->json('data.id');
        $this->withHeader('Idempotency-Key', 'trip-return-post')->postJson("/api/admin/representative-returns/{$returnId}/post")->assertOk();
        $this->assertSame(0, (int) RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->value('quantity'));

        $submission = $this->actingAs($repUser)->withHeader('Idempotency-Key', 'trip-cash-submit')->postJson('/api/sales/cash-submissions', ['amount' => 1200])->assertCreated();
        $submissionId = $submission->json('data.id');
        $this->actingAs($admin)->withHeader('Idempotency-Key', 'trip-cash-confirm')->postJson("/api/admin/cash-submissions/{$submissionId}/confirm")->assertOk();
        $this->postJson("/api/admin/trips/{$tripId}/complete", ['notes' => 'Reconciled.'])
            ->assertOk()->assertJsonPath('data.status', 'completed');

        $this->getJson("/api/admin/trips/{$tripId}")->assertOk()
            ->assertJsonPath('data.product_summary.0.issued', 10)
            ->assertJsonPath('data.product_summary.0.product.base_unit.name', 'bottle')
            ->assertJsonPath('data.product_summary.0.product.default_selling_unit.conversion_factor', 1)
            ->assertJsonPath('data.product_summary.0.sold', 3)
            ->assertJsonPath('data.product_summary.0.returned', 7)
            ->assertJsonPath('data.product_summary.0.remaining', 0)
            ->assertJsonPath('data.financial_summary.cash_sales', 1700)
            ->assertJsonPath('data.financial_summary.cash_hold_sales', 800)
            ->assertJsonPath('data.financial_summary.credit_sales', 900)
            ->assertJsonPath('data.financial_summary.credit_collected', 500)
            ->assertJsonPath('data.financial_summary.cash_credit_collected', 400)
            ->assertJsonPath('data.financial_summary.payment_method_totals.1.key', 'banking')
            ->assertJsonPath('data.financial_summary.payment_method_totals.1.sales_amount', 900)
            ->assertJsonPath('data.financial_summary.payment_method_totals.1.collection_amount', 100)
            ->assertJsonPath('data.financial_summary.latest_credit_balance', 400)
            ->assertJsonPath('data.financial_summary.expenses', 500)
            ->assertJsonPath('data.financial_summary.cash_submitted_confirmed', 1200);

        $query = http_build_query(['warehouse_id' => $warehouse->id, 'region_id' => $region->id, 'representative_id' => $representative->id, 'date_from' => today()->toDateString(), 'date_to' => today()->toDateString()]);
        $this->getJson('/api/admin/reports/trip?'.$query)->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.product.id', $product->id)
            ->assertJsonPath('data.0.product.default_selling_unit.conversion_factor', 1)
            ->assertJsonPath('data.0.quantity', 3)
            ->assertJsonPath('data.0.net_amount', 2640);
        $this->getJson('/api/admin/reports/trip?date_from=2099-01-01&date_to=2099-01-02')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/admin/reports/trip?date_from=2026-09-02&date_to=2026-09-01')->assertUnprocessable();

        $this->actingAs($repUser)->getJson('/api/sales/customer-options')->assertOk()
            ->assertJsonPath('regions.0.id', $region->id)
            ->assertJsonPath('payment_methods.0.key', 'cash');
        $this->getJson('/api/sales/customers')->assertOk()->assertJsonPath('meta.total', 1);
        $this->postJson('/api/sales/customers', [
            'name' => 'After Trip Customer',
            'customer_type' => 'Shop',
            'region_id' => $region->id,
        ])->assertCreated()->assertJsonPath('customer.name', 'After Trip Customer');
    }

    private function sale(User $user, Customer $customer, Product $product, int $quantity, string $payment, string $key, string $method = 'cash'): int
    {
        return $this->actingAs($user)->withHeader('Idempotency-Key', $key)->postJson('/api/sales/sales', $this->salePayload($customer, $product, $quantity, $payment, $method))->assertCreated()->json('data.id');
    }

    private function salePayload(Customer $customer, Product $product, int $quantity, string $payment, string $method = 'cash'): array
    {
        return ['customer_id' => $customer->id, 'payment_type' => $payment, 'payment_method' => $payment === 'cash' ? $method : null, 'creation_latitude' => 16.84, 'creation_longitude' => 96.17, 'items' => [['product_id' => $product->id, 'quantity' => $quantity, 'discount_percentage' => 10]]];
    }
}
