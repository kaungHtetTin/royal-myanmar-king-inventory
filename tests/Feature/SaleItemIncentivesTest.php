<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\Customer;
use App\Models\Product;
use App\Models\RepresentativeInventory;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\Trip;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SaleItemIncentivesTest extends TestCase
{
    use RefreshDatabase;

    protected bool $useLegacyTripCompatibility = false;

    private Product $product;
    private Customer $customer;
    private SalesRepresentative $representative;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);
        $warehouse = Warehouse::factory()->create();
        $region = $warehouse->regions()->create(['name' => 'Test route', 'is_active' => true]);
        $this->representative = SalesRepresentative::factory()->create(['user_id' => $user->id, 'primary_warehouse_id' => $warehouse->id]);
        $this->representative->regions()->sync([$region->id]);
        Trip::query()->create(['reference' => 'TEST-TRIP', 'title' => 'Test', 'warehouse_id' => $warehouse->id, 'region_id' => $region->id, 'sales_representative_id' => $this->representative->id, 'vehicle_id' => Vehicle::factory()->create()->id, 'status' => 'operation', 'created_by' => $user->id]);
        $this->customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'region_id' => $region->id, 'credit_allowed' => true, 'credit_limit' => 10000]);
        $this->product = Product::factory()->create(['unit' => 'bottle', 'selling_price' => 1000, 'discount_percentage' => 75]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $this->representative->id, 'product_id' => $this->product->id, 'quantity' => 100, 'foc_quantity' => 10]);
        $this->actingAs($user);
    }

    private function payload(array $item = []): array
    {
        return ['customer_id' => $this->customer->id, 'payment_type' => 'cash', 'payment_method' => 'cash', 'creation_latitude' => 16.84, 'creation_longitude' => 96.17, 'items' => [array_merge(['product_id' => $this->product->id, 'quantity' => 2], $item)]];
    }

    public function test_product_discount_is_ignored_and_item_incentives_survive_edit_and_post(): void
    {
        $plain = $this->withHeader('Idempotency-Key', 'plain')->postJson('/api/sales/sales', $this->payload())
            ->assertCreated()->assertJsonPath('data.total_amount', 2000)->assertJsonPath('data.items.0.discount_percentage', 0);
        $input = $this->payload(['discount_percentage' => 10, 'promotion_title' => 'Launch', 'promotion_amount' => 50, 'foc_quantity' => 1]) + ['cashback_amount' => 100];
        $id = $this->withHeader('Idempotency-Key', 'incentives')->postJson('/api/sales/sales', $input)
            ->assertCreated()->assertJsonPath('data.total_amount', 1650)->assertJsonPath('data.items.0.discount_amount', 200)
            ->assertJsonPath('data.total_cashback', 100)->assertJsonPath('data.total_item_promotion', 50)->json('data.id');
        unset($input['creation_latitude'], $input['creation_longitude']);
        $input['cashback_amount'] = 150;
        $this->putJson("/api/sales/sales/{$id}", $input)->assertOk()->assertJsonPath('data.total_amount', 1600)
            ->assertJsonPath('data.items.0.promotion_title', 'Launch');
        $this->withHeader('Idempotency-Key', 'post')->postJson("/api/sales/sales/{$id}/post")->assertOk();
        $this->assertDatabaseHas('representative_cash_balances', ['sales_representative_id' => $this->representative->id, 'amount' => 1600]);
        $this->assertDatabaseHas('representative_inventories', ['sales_representative_id' => $this->representative->id, 'quantity' => 98, 'foc_quantity' => 9]);
        $this->putJson("/api/sales/sales/{$id}", $input)->assertConflict();
        $plain->assertJsonPath('data.cashback_amount', 0);
    }

    public function test_invalid_incentives_are_rejected_without_saving(): void
    {
        foreach ([
            [['discount_percentage' => 101], 'discount_percentage'],
            [['discount_percentage' => 1.234], 'discount_percentage'],
        ] as $index => [$item, $field]) {
            $this->withHeader('Idempotency-Key', "invalid-{$index}")->postJson('/api/sales/sales', $this->payload($item))
                ->assertUnprocessable()->assertJsonValidationErrors("items.0.{$field}");
        }
        foreach ([-1, 0.5, 2001] as $index => $cashback) {
            $this->withHeader('Idempotency-Key', "invalid-cashback-{$index}")->postJson('/api/sales/sales', $this->payload() + ['cashback_amount' => $cashback])
                ->assertUnprocessable()->assertJsonValidationErrors('cashback_amount');
        }
        $this->assertDatabaseCount('sales', 0);
    }

    public function test_posting_detects_tampered_item_totals(): void
    {
        $id = $this->withHeader('Idempotency-Key', 'tamper')->postJson('/api/sales/sales', $this->payload() + ['cashback_amount' => 100])
            ->assertCreated()->json('data.id');
        Sale::findOrFail($id)->items()->update(['line_total' => 1900]);
        $this->withHeader('Idempotency-Key', 'tamper-post')->postJson("/api/sales/sales/{$id}/post")
            ->assertConflict()->assertJsonPath('code', 'SALE_TOTAL_MISMATCH');
    }

    public function test_item_promotion_can_be_created_and_edited_without_a_title(): void
    {
        $input = $this->payload(['promotion_amount' => 50]);
        $id = $this->withHeader('Idempotency-Key', 'untitled')->postJson('/api/sales/sales', $input)
            ->assertCreated()->assertJsonPath('data.total_amount', 1950)
            ->assertJsonPath('data.items.0.promotion_title', null)->json('data.id');
        unset($input['creation_latitude'], $input['creation_longitude']);
        $input['items'][0]['promotion_amount'] = 100;
        $this->putJson("/api/sales/sales/{$id}", $input)->assertOk()->assertJsonPath('data.total_amount', 1900);
        $this->withHeader('Idempotency-Key', 'untitled-post')->postJson("/api/sales/sales/{$id}/post")->assertOk();
    }

    public function test_credit_and_void_use_the_net_amount_and_preserve_stock_quantities(): void
    {
        $input = $this->payload(['discount_percentage' => 12.34, 'promotion_title' => 'Offer', 'promotion_amount' => 50]) + ['cashback_amount' => 100];
        $input['payment_type'] = 'credit';
        $id = $this->withHeader('Idempotency-Key', 'credit')->postJson('/api/sales/sales', $input)
            ->assertCreated()->assertJsonPath('data.items.0.discount_amount', 247)->assertJsonPath('data.total_amount', 1603)->json('data.id');
        $this->withHeader('Idempotency-Key', 'credit-post')->postJson("/api/sales/sales/{$id}/post")->assertOk();
        $this->assertDatabaseHas('customer_credit_balances', ['customer_id' => $this->customer->id, 'outstanding_amount' => 1603]);
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);
        $this->actingAs($admin)->withHeader('Idempotency-Key', 'credit-void')->postJson("/api/admin/sales/{$id}/void", ['reason' => 'Cancelled order'])->assertOk();
        $this->assertDatabaseHas('customer_credit_balances', ['customer_id' => $this->customer->id, 'outstanding_amount' => 0]);
        $this->assertDatabaseHas('representative_inventories', ['sales_representative_id' => $this->representative->id, 'quantity' => 100]);
    }

    public function test_legacy_invoice_promotion_is_preserved_but_new_invoice_promotions_are_rejected(): void
    {
        $this->withHeader('Idempotency-Key', 'invoice-promo')->postJson('/api/sales/sales', $this->payload() + ['promotion_title' => 'Invoice', 'promotion_amount' => 100])
            ->assertUnprocessable()->assertJsonValidationErrors('promotion_amount');
        $id = $this->withHeader('Idempotency-Key', 'legacy')->postJson('/api/sales/sales', $this->payload())
            ->assertCreated()->json('data.id');
        Sale::findOrFail($id)->update(['promotion_title' => 'Legacy', 'promotion_amount' => 100, 'total_amount' => 1900]);
        $input = $this->payload();
        unset($input['creation_latitude'], $input['creation_longitude']);
        $this->putJson("/api/sales/sales/{$id}", $input)->assertOk()->assertJsonPath('data.total_amount', 1900)
            ->assertJsonPath('data.promotion_title', 'Legacy');
        $this->withHeader('Idempotency-Key', 'legacy-post')->postJson("/api/sales/sales/{$id}/post")->assertOk();
    }

    public function test_full_discount_produces_zero_and_each_product_has_its_own_incentives(): void
    {
        $other = Product::factory()->create(['unit' => 'box', 'selling_price' => 500]);
        $input = $this->payload(['discount_percentage' => 100]);
        $input['items'][] = ['product_id' => $other->id, 'quantity' => 1];
        $input['cashback_amount'] = 50;
        $this->withHeader('Idempotency-Key', 'multiple')->postJson('/api/sales/sales', $input)->assertCreated()
            ->assertJsonPath('data.items.0.line_total', 0)->assertJsonPath('data.items.1.line_total', 500)->assertJsonPath('data.total_amount', 450);
    }
}
