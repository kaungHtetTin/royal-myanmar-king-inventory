<?php

namespace Tests\Feature;

use App\Enums\PaymentType;
use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Enums\SaleStatus;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Region;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_super_admin_can_create_customer_with_credit_and_dedicated_audit_history(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();

        $response = $this->actingAs($admin)->postJson('/api/admin/customers', $this->payload($warehouse, [
            'code' => ' cus-abc ',
            'name' => ' ABC Shop ',
            'credit_allowed' => true,
            'credit_limit' => 2000000,
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.code', 'CUS-000001')
            ->assertJsonPath('data.warehouse.id', $warehouse->id)
            ->assertJsonPath('data.credit_limit', 2000000);
        $this->assertDatabaseHas('customers', ['code' => 'CUS-000001', 'credit_allowed' => true, 'credit_limit' => 2000000]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'customer.created', 'subject_id' => $response->json('data.id')]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'customer.credit_updated', 'subject_id' => $response->json('data.id')]);
    }

    public function test_customer_code_is_generated_automatically(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();

        $first = $this->actingAs($admin)->postJson('/api/admin/customers',
            collect($this->payload($warehouse))->except('code')->all());
        $second = $this->postJson('/api/admin/customers',
            $this->payload($warehouse, ['code' => 'MANUAL-CODE', 'name' => 'Second Shop']));

        $first->assertCreated()->assertJsonPath('data.code', 'CUS-000001');
        $second->assertCreated()->assertJsonPath('data.code', 'CUS-000002');
    }

    public function test_office_viewer_only_lists_assigned_warehouse_customers_and_options(): void
    {
        $viewer = $this->officeUser(PermissionName::CustomerView);
        $assigned = Warehouse::factory()->create(['code' => 'YGN']);
        $foreign = Warehouse::factory()->create(['code' => 'MDY']);
        $viewer->warehouses()->attach($assigned, ['assigned_by' => $viewer->id]);
        $matching = Customer::factory()->withCredit()->create(['warehouse_id' => $assigned->id, 'region_id' => $this->region($assigned)->id, 'code' => 'CUS-YGN', 'name' => 'Yangon Shop', 'customer_type' => 'Shop']);
        Customer::factory()->create(['warehouse_id' => $foreign->id, 'region_id' => $this->region($foreign)->id, 'code' => 'CUS-MDY', 'name' => 'Mandalay Shop']);

        $matching->refresh();
        $this->actingAs($viewer)->getJson('/api/admin/customers?warehouse_id='.$assigned->id.'&region_id='.$matching->region_id)
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $matching->id)->assertJsonPath('meta.total', 1);
        $this->getJson('/api/admin/customer-options')->assertOk()
            ->assertJsonCount(1, 'warehouses')->assertJsonPath('warehouses.0.id', $assigned->id)
            ->assertJsonPath('regions.0.id', $matching->region_id)
            ->assertJsonMissingPath('ways');
        $this->getJson('/api/admin/customers?warehouse_id='.$foreign->id)->assertForbidden();
    }

    public function test_customer_detail_is_available_only_inside_the_viewers_warehouse_scope(): void
    {
        $viewer = $this->officeUser(PermissionName::CustomerView);
        $assigned = Warehouse::factory()->create(['code' => 'YGN']);
        $foreign = Warehouse::factory()->create(['code' => 'MDY']);
        $viewer->warehouses()->attach($assigned, ['assigned_by' => $viewer->id]);
        $matching = Customer::factory()->create(['warehouse_id' => $assigned->id, 'code' => 'CUS-YGN']);
        $outsideScope = Customer::factory()->create(['warehouse_id' => $foreign->id, 'code' => 'CUS-MDY']);

        $this->actingAs($viewer)->getJson('/api/admin/customers/'.$matching->id)
            ->assertOk()
            ->assertJsonPath('data.id', $matching->id)
            ->assertJsonPath('data.warehouse.id', $assigned->id);
        $this->getJson('/api/admin/customers/'.$outsideScope->id)->assertForbidden();
    }

    public function test_sale_report_aggregates_posted_product_quantities_inside_the_date_range(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $region = $this->region($warehouse);
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'region_id' => $region->id]);
        $representative = SalesRepresentative::factory()->create(['primary_warehouse_id' => $warehouse->id]);
        $product = Product::factory()->create(['name' => 'Drinking Water', 'unit' => 'bottle']);
        $baseUnit = $product->baseUnit()->firstOrFail();
        $baseUnit->update(['is_default_selling' => false]);
        $carton = $product->units()->create([
            'name' => 'carton',
            'conversion_factor' => 12,
            'is_base' => false,
            'is_default_selling' => true,
            'is_active' => true,
        ]);

        $posted = Sale::query()->create([
            'reference' => 'SAL-REPORT-1',
            'sales_representative_id' => $representative->id,
            'warehouse_id' => $warehouse->id,
            'region_id' => $region->id,
            'customer_id' => $customer->id,
            'payment_type' => PaymentType::Cash,
            'payment_method' => 'cash',
            'total_amount' => 8500,
            'cashback_amount' => 200,
            'status' => SaleStatus::Posted,
            'created_by' => $admin->id,
            'posted_by' => $admin->id,
            'posted_at' => '2026-09-02 10:00:00',
        ]);
        $posted->items()->create([
            'product_id' => $product->id,
            'product_unit_id' => $carton->id,
            'quantity' => 2,
            'base_quantity' => 28,
            'unit_price' => 5000,
            'discount_percentage' => 10,
            'discount_amount' => 1000,
            'promotion_amount' => 300,
            'line_total' => 8700,
            'foc_product_unit_id' => $baseUnit->id,
            'foc_quantity' => 2,
            'foc_base_quantity' => 2,
        ]);

        $draft = Sale::query()->create([
            'reference' => 'SAL-REPORT-DRAFT',
            'sales_representative_id' => $representative->id,
            'warehouse_id' => $warehouse->id,
            'region_id' => $region->id,
            'customer_id' => $customer->id,
            'payment_type' => PaymentType::Cash,
            'payment_method' => 'cash',
            'total_amount' => 5000,
            'status' => SaleStatus::Draft,
            'created_by' => $admin->id,
        ]);
        $draft->items()->create([
            'product_id' => $product->id,
            'product_unit_id' => $carton->id,
            'quantity' => 1,
            'base_quantity' => 12,
            'unit_price' => 5000,
            'line_total' => 5000,
        ]);

        $this->actingAs($admin)->getJson('/api/admin/customers/'.$customer->id.'/sale-report?date_from=2026-09-01&date_to=2026-09-02')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.product.name', 'Drinking Water')
            ->assertJsonPath('data.0.product.default_selling_unit.name', 'carton')
            ->assertJsonPath('data.0.product.default_selling_unit.conversion_factor', 12)
            ->assertJsonPath('data.0.purchased_quantity', 28)
            ->assertJsonPath('data.0.foc_quantity', 2)
            ->assertJsonPath('data.0.total_quantity', 30)
            ->assertJsonPath('data.0.net_amount', 8700)
            ->assertJsonPath('summary.products', 1);

        $secondSale = $posted->replicate();
        $secondSale->reference = 'SAL-REPORT-2';
        $secondSale->save();
        $secondItem = $posted->items()->firstOrFail()->replicate();
        $secondItem->sale_id = $secondSale->id;
        $secondItem->save();
        $this->getJson('/api/admin/customers/'.$customer->id.'/sale-report?date_from=2026-09-01&date_to=2026-09-02')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.net_amount', 17400);

        $this->getJson('/api/admin/customers/'.$customer->id.'/sale-report?date_from=2026-09-03&date_to=2026-09-03')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_creator_without_credit_permission_can_create_cash_only_customer_but_not_credit_customer(): void
    {
        $creator = $this->officeUser(PermissionName::CustomerCreate);
        $warehouse = Warehouse::factory()->create();
        $creator->warehouses()->attach($warehouse, ['assigned_by' => $creator->id]);

        $this->actingAs($creator)->postJson('/api/admin/customers', $this->payload($warehouse))
            ->assertCreated()->assertJsonPath('data.credit_allowed', false)->assertJsonPath('data.credit_limit', 0);
        $this->postJson('/api/admin/customers', $this->payload($warehouse, ['code' => 'CUS-CREDIT', 'credit_allowed' => true, 'credit_limit' => 100000]))
            ->assertForbidden();
    }

    public function test_editor_can_change_profile_but_cannot_change_credit_or_foreign_scope(): void
    {
        $editor = $this->officeUser(PermissionName::CustomerEdit);
        $assigned = Warehouse::factory()->create();
        $foreign = Warehouse::factory()->create();
        $editor->warehouses()->attach($assigned, ['assigned_by' => $editor->id]);
        $customer = Customer::factory()->withCredit()->create(['warehouse_id' => $assigned->id]);

        $this->actingAs($editor)->putJson('/api/admin/customers/'.$customer->id, $this->payload($assigned, [
            'code' => $customer->code,
            'name' => 'Updated Customer',
            'credit_allowed' => true,
            'credit_limit' => 2000000,
            'is_active' => false,
        ]))->assertOk()->assertJsonPath('data.name', 'Updated Customer')->assertJsonPath('data.is_active', false);

        $this->putJson('/api/admin/customers/'.$customer->id, $this->payload($assigned, [
            'code' => $customer->code,
            'credit_allowed' => false,
            'credit_limit' => 0,
        ]))->assertForbidden();
        $this->putJson('/api/admin/customers/'.$customer->id, $this->payload($foreign, ['code' => $customer->code]))->assertForbidden();
        $this->assertDatabaseHas('customers', ['id' => $customer->id, 'credit_allowed' => true, 'credit_limit' => 2000000, 'is_active' => false]);
    }

    public function test_credit_manager_can_change_credit_with_old_and_new_values_audited(): void
    {
        $manager = $this->officeUser(PermissionName::CustomerView, PermissionName::CustomerCreditManage);
        $warehouse = Warehouse::factory()->create();
        $manager->warehouses()->attach($warehouse, ['assigned_by' => $manager->id]);
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id]);

        $this->actingAs($manager)->putJson('/api/admin/customers/'.$customer->id.'/credit', [
            'credit_allowed' => true,
            'credit_limit' => 750000,
        ])->assertOk()->assertJsonPath('data.credit_limit', 750000);

        $audit = AuditLog::query()->where('event', 'customer.credit_updated')->where('subject_id', $customer->id)->sole();
        $this->assertFalse($audit->metadata['old']['credit_allowed']);
        $this->assertSame(0, $audit->metadata['old']['credit_limit']);
        $this->assertTrue($audit->metadata['new']['credit_allowed']);
        $this->assertSame(750000, $audit->metadata['new']['credit_limit']);
    }

    public function test_credit_limit_is_whole_non_negative_mmk(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $this->actingAs($admin)->postJson('/api/admin/customers', $this->payload($warehouse, ['credit_limit' => -1]))
            ->assertUnprocessable()->assertJsonValidationErrors('credit_limit');
        $this->postJson('/api/admin/customers', $this->payload($warehouse, ['credit_limit' => 10.5]))
            ->assertUnprocessable()->assertJsonValidationErrors('credit_limit');
        $inactiveWarehouse = Warehouse::factory()->inactive()->create();
        $this->postJson('/api/admin/customers', $this->payload($inactiveWarehouse, ['code' => 'CUS-INACTIVE']))
            ->assertUnprocessable()->assertJsonValidationErrors('warehouse_id');
    }

    /** @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function payload(Warehouse $warehouse, array $overrides = []): array
    {
        return array_merge([
            'warehouse_id' => $warehouse->id,
            'region_id' => $this->region($warehouse)->id,
            'code' => 'CUS-001',
            'name' => 'Corner Shop',
            'customer_type' => 'Shop',
            'phone' => '09-123456789',
            'address' => 'No. 12, Main Road',
            'credit_allowed' => false,
            'credit_limit' => 0,
            'notes' => 'Retail customer.',
            'is_active' => true,
        ], $overrides);
    }

    private function region(Warehouse $warehouse): Region
    {
        return $warehouse->regions()->firstOrCreate(['name' => 'Test Region'], ['is_active' => true]);
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
