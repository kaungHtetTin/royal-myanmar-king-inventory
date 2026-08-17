<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WarehouseManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_super_admin_can_create_a_complete_warehouse_and_action_is_audited(): void
    {
        $admin = $this->superAdmin();

        $response = $this->actingAs($admin)->postJson('/api/admin/warehouses', $this->payload([
            'code' => 'ygn-main',
            'name' => 'Yangon Main Warehouse',
            'region' => 'Yangon',
            'township' => 'Hlaing',
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.code', 'YGN-MAIN')
            ->assertJsonPath('data.region', 'Yangon')
            ->assertJsonPath('data.users_count', 0);
        $this->assertDatabaseHas('warehouses', ['code' => 'YGN-MAIN', 'name' => 'Yangon Main Warehouse']);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $admin->id,
            'event' => 'warehouse.created',
            'subject_type' => Warehouse::class,
            'subject_id' => $response->json('data.id'),
        ]);
    }

    public function test_office_admin_only_lists_assigned_warehouses_with_server_filters(): void
    {
        $admin = $this->officeAdmin();
        $assigned = Warehouse::factory()->create(['code' => 'YGN', 'name' => 'Yangon Main', 'region' => 'Yangon']);
        Warehouse::factory()->create(['code' => 'MDY', 'name' => 'Mandalay Main', 'region' => 'Mandalay']);
        $admin->warehouses()->attach($assigned, ['assigned_by' => $admin->id]);

        $response = $this->actingAs($admin)->getJson('/api/admin/warehouses?search=Yangon&status=active&sort=code&direction=desc');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $assigned->id)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_office_admin_without_mutation_permissions_cannot_create_or_edit(): void
    {
        $admin = $this->officeAdmin();
        $warehouse = Warehouse::factory()->create();
        $admin->warehouses()->attach($warehouse, ['assigned_by' => $admin->id]);

        $this->actingAs($admin)->postJson('/api/admin/warehouses', $this->payload())->assertForbidden();
        $this->putJson('/api/admin/warehouses/'.$warehouse->id, $this->payload())->assertForbidden();
    }

    public function test_editor_can_only_update_assigned_warehouse_and_deactivation_preserves_assignments(): void
    {
        $admin = $this->officeAdmin();
        $admin->givePermissionTo(PermissionName::WarehouseEdit->value);
        $assigned = Warehouse::factory()->create(['code' => 'YGN']);
        $foreign = Warehouse::factory()->create(['code' => 'MDY']);
        $admin->warehouses()->attach($assigned, ['assigned_by' => $admin->id]);

        $this->actingAs($admin)->putJson('/api/admin/warehouses/'.$assigned->id, $this->payload([
            'code' => 'ygn',
            'name' => 'Yangon Distribution Centre',
            'is_active' => false,
        ]))->assertOk()
            ->assertJsonPath('data.name', 'Yangon Distribution Centre')
            ->assertJsonPath('data.is_active', false);

        $this->putJson('/api/admin/warehouses/'.$foreign->id, $this->payload(['code' => 'MDY']))->assertForbidden();
        $this->assertDatabaseHas('user_warehouse', ['user_id' => $admin->id, 'warehouse_id' => $assigned->id]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'warehouse.updated', 'subject_id' => $assigned->id]);
    }

    public function test_code_is_required_unique_and_case_normalized(): void
    {
        $admin = $this->superAdmin();
        Warehouse::factory()->create(['code' => 'YGN']);

        $this->actingAs($admin)->postJson('/api/admin/warehouses', $this->payload(['code' => 'ygn']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('code');

        $this->postJson('/api/admin/warehouses', $this->payload(['code' => 'invalid code']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }

    /** @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'code' => 'BGO-01',
            'name' => 'Bago Warehouse',
            'region' => 'Bago',
            'township' => 'Bago',
            'address' => 'No. 12, Main Road',
            'phone' => '09-123456789',
            'notes' => 'Regional distribution point.',
            'is_active' => true,
        ], $overrides);
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SuperAdmin->value);

        return $user;
    }

    private function officeAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);

        return $user;
    }
}
