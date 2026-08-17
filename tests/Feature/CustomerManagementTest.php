<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\AuditLog;
use App\Models\Customer;
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
            ->assertJsonPath('data.code', 'CUS-ABC')
            ->assertJsonPath('data.warehouse.id', $warehouse->id)
            ->assertJsonPath('data.credit_limit', 2000000);
        $this->assertDatabaseHas('customers', ['code' => 'CUS-ABC', 'credit_allowed' => true, 'credit_limit' => 2000000]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'customer.created', 'subject_id' => $response->json('data.id')]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'customer.credit_updated', 'subject_id' => $response->json('data.id')]);
    }

    public function test_office_viewer_only_lists_assigned_warehouse_customers_and_options(): void
    {
        $viewer = $this->officeUser(PermissionName::CustomerView);
        $assigned = Warehouse::factory()->create(['code' => 'YGN']);
        $foreign = Warehouse::factory()->create(['code' => 'MDY']);
        $viewer->warehouses()->attach($assigned, ['assigned_by' => $viewer->id]);
        $matching = Customer::factory()->withCredit()->create(['warehouse_id' => $assigned->id, 'code' => 'CUS-YGN', 'name' => 'Yangon Shop', 'customer_type' => 'Shop']);
        Customer::factory()->create(['warehouse_id' => $foreign->id, 'code' => 'CUS-MDY', 'name' => 'Mandalay Shop']);

        $this->actingAs($viewer)->getJson('/api/admin/customers?search=Yangon&status=active&type=Shop&credit=allowed&warehouse_id='.$assigned->id.'&sort=code&direction=desc')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $matching->id)->assertJsonPath('meta.total', 1);
        $this->getJson('/api/admin/customer-options')->assertOk()
            ->assertJsonCount(1, 'warehouses')->assertJsonPath('warehouses.0.id', $assigned->id)->assertJsonPath('types.0', 'Shop');
        $this->getJson('/api/admin/customers?warehouse_id='.$foreign->id)->assertForbidden();
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

    public function test_code_is_unique_and_credit_limit_is_whole_non_negative_mmk(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        Customer::factory()->create(['warehouse_id' => $warehouse->id, 'code' => 'CUS-ABC']);

        $this->actingAs($admin)->postJson('/api/admin/customers', $this->payload($warehouse, ['code' => 'cus-abc']))
            ->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->postJson('/api/admin/customers', $this->payload($warehouse, ['credit_limit' => -1]))
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
            'code' => 'CUS-001',
            'name' => 'Corner Shop',
            'customer_type' => 'Shop',
            'phone' => '09-123456789',
            'region' => 'Yangon',
            'township' => 'Hlaing',
            'address' => 'No. 12, Main Road',
            'credit_allowed' => false,
            'credit_limit' => 0,
            'notes' => 'Retail customer.',
            'is_active' => true,
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
        $user->givePermissionTo(collect($permissions)->map->value->all());

        return $user;
    }
}
