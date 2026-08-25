<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RepresentativeManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_super_admin_creates_profile_login_warehouse_and_vehicle_atomically(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $vehicle = Vehicle::factory()->create();

        $response = $this->actingAs($admin)->postJson('/api/admin/representatives', $this->payload($warehouse, [
            'code' => ' sr-001 ',
            'username' => ' KoAung ',
            'email' => null,
            'vehicle_id' => $vehicle->id,
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.code', 'SR-000001')
            ->assertJsonPath('data.account.username', 'koaung')
            ->assertJsonPath('data.account.email', null)
            ->assertJsonPath('data.primary_warehouse.id', $warehouse->id)
            ->assertJsonPath('data.vehicle.id', $vehicle->id);
        $representative = SalesRepresentative::query()->findOrFail($response->json('data.id'));
        $user = $representative->user;
        $this->assertTrue($user->hasRole(RoleName::SalesRepresentative->value));
        $this->assertTrue(Hash::check('password', $user->password));
        $this->assertDatabaseHas('user_warehouse', ['user_id' => $user->id, 'warehouse_id' => $warehouse->id]);
        $this->assertDatabaseHas('vehicles', ['id' => $vehicle->id, 'sales_representative_id' => $representative->id]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'representative.created', 'subject_id' => $representative->id]);

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', [
            'login' => 'koaung', 'password' => 'password', 'portal' => 'sales', 'remember' => false,
        ])->assertOk()->assertJsonPath('user.representative_id', $representative->id);
    }

    public function test_representative_code_is_generated_automatically(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $payload = collect($this->payload($warehouse, ['email' => null]))->except('code')->all();

        $first = $this->actingAs($admin)->postJson('/api/admin/representatives', $payload);
        $second = $this->postJson('/api/admin/representatives', array_merge($payload, [
            'code' => 'MANUAL-CODE', 'name' => 'Second Representative', 'username' => 'second.rep',
        ]));

        $first->assertCreated()->assertJsonPath('data.code', 'SR-000001');
        $second->assertCreated()->assertJsonPath('data.code', 'SR-000002');
    }

    public function test_office_viewer_lists_only_assigned_representatives_with_filters_and_scoped_options(): void
    {
        $viewer = $this->officeUser(PermissionName::RepresentativeView);
        $assigned = Warehouse::factory()->create(['code' => 'YGN']);
        $foreign = Warehouse::factory()->create(['code' => 'MDY']);
        $viewer->warehouses()->attach($assigned, ['assigned_by' => $viewer->id]);
        $matching = $this->representative('SR-001', 'Ko Aung', $assigned);
        $this->representative('SR-002', 'Ma Su', $foreign);
        $vehicle = Vehicle::factory()->create(['sales_representative_id' => $matching->id]);

        $this->actingAs($viewer)->getJson('/api/admin/representatives?search=ko.aung&status=active&warehouse_id='.$assigned->id.'&vehicle=assigned&sort=code&direction=desc')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $matching->id)->assertJsonPath('data.0.vehicle.id', $vehicle->id);
        $this->getJson('/api/admin/representative-options')->assertOk()
            ->assertJsonCount(1, 'warehouses')->assertJsonPath('warehouses.0.id', $assigned->id);
        $this->getJson('/api/admin/representatives?warehouse_id='.$foreign->id)->assertForbidden();
    }

    public function test_viewer_without_mutation_permissions_cannot_create_or_edit(): void
    {
        $viewer = $this->officeUser(PermissionName::RepresentativeView);
        $warehouse = Warehouse::factory()->create();
        $viewer->warehouses()->attach($warehouse, ['assigned_by' => $viewer->id]);
        $representative = $this->representative('SR-001', 'Ko Aung', $warehouse);

        $this->actingAs($viewer)->postJson('/api/admin/representatives', $this->payload($warehouse))->assertForbidden();
        $this->putJson('/api/admin/representatives/'.$representative->id, $this->payload($warehouse, ['code' => $representative->code]))->assertForbidden();
    }

    public function test_editor_updates_linked_account_and_deactivation_preserves_profile_and_vehicle(): void
    {
        $editor = $this->officeUser(PermissionName::RepresentativeView, PermissionName::RepresentativeEdit);
        $warehouse = Warehouse::factory()->create();
        $foreign = Warehouse::factory()->create();
        $editor->warehouses()->attach($warehouse, ['assigned_by' => $editor->id]);
        $representative = $this->representative('SR-001', 'Ko Aung', $warehouse);
        $vehicle = Vehicle::factory()->create(['sales_representative_id' => $representative->id]);

        $this->actingAs($editor)->putJson('/api/admin/representatives/'.$representative->id, $this->payload($warehouse, [
            'code' => 'sr-001', 'name' => 'Ko Aung Updated', 'username' => 'aung.updated', 'email' => null,
            'password' => '', 'password_confirmation' => '', 'vehicle_id' => $vehicle->id, 'is_active' => false,
        ]))->assertOk()
            ->assertJsonPath('data.name', 'Ko Aung Updated')
            ->assertJsonPath('data.account.username', 'aung.updated')
            ->assertJsonPath('data.account.is_active', false)
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('sales_representatives', ['id' => $representative->id, 'is_active' => false]);
        $this->assertDatabaseHas('users', ['id' => $representative->user_id, 'is_active' => false]);
        $this->assertDatabaseHas('vehicles', ['id' => $vehicle->id, 'sales_representative_id' => $representative->id]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $editor->id, 'event' => 'representative.updated', 'subject_id' => $representative->id]);

        $this->putJson('/api/admin/representatives/'.$representative->id, $this->payload($foreign, [
            'code' => 'SR-001', 'username' => 'aung.updated', 'email' => null, 'password' => '', 'password_confirmation' => '',
        ]))->assertForbidden();
    }

    public function test_username_email_and_vehicle_assignment_are_validated(): void
    {
        $admin = $this->superAdmin();
        $warehouse = Warehouse::factory()->create();
        $existing = $this->representative('SR-001', 'Ko Aung', $warehouse, 'koaung', 'aung@example.com');
        $vehicle = Vehicle::factory()->create(['sales_representative_id' => $existing->id]);
        $inactiveVehicle = Vehicle::factory()->inactive()->create();

        $this->actingAs($admin)->postJson('/api/admin/representatives', $this->payload($warehouse, ['username' => 'KOAUNG']))
            ->assertUnprocessable()->assertJsonValidationErrors('username');
        $this->postJson('/api/admin/representatives', $this->payload($warehouse, ['email' => 'AUNG@example.com']))
            ->assertUnprocessable()->assertJsonValidationErrors('email');
        $this->postJson('/api/admin/representatives', $this->payload($warehouse, ['vehicle_id' => $vehicle->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('vehicle_id');
        $this->postJson('/api/admin/representatives', $this->payload($warehouse, ['vehicle_id' => $inactiveVehicle->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('vehicle_id');
        $inactiveWarehouse = Warehouse::factory()->inactive()->create();
        $this->postJson('/api/admin/representatives', $this->payload($inactiveWarehouse, ['code' => 'SR-INACTIVE', 'username' => 'inactive.warehouse', 'email' => null]))
            ->assertUnprocessable()->assertJsonValidationErrors('primary_warehouse_id');
        $this->postJson('/api/admin/representatives', $this->payload($warehouse, [
            'password' => 'short7!', 'password_confirmation' => 'short7!',
        ]))->assertUnprocessable()->assertJsonValidationErrors('password');
        $this->postJson('/api/admin/representatives', $this->payload($warehouse, [
            'password' => 'toolong99', 'password_confirmation' => 'toolong99',
        ]))->assertUnprocessable()->assertJsonValidationErrors('password');
    }

    /** @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function payload(Warehouse $warehouse, array $overrides = []): array
    {
        return array_merge([
            'code' => 'SR-NEW', 'name' => 'New Representative', 'phone' => '09-123456789', 'email' => 'new.rep@example.com',
            'username' => 'new.rep', 'password' => 'password', 'password_confirmation' => 'password',
            'primary_warehouse_id' => $warehouse->id, 'region' => 'Yangon', 'vehicle_id' => null,
            'notes' => 'Distribution representative.', 'is_active' => true,
        ], $overrides);
    }

    private function representative(string $code, string $name, Warehouse $warehouse, ?string $username = null, ?string $email = null): SalesRepresentative
    {
        $user = User::factory()->create(['name' => $name, 'username' => $username ?? strtolower(str_replace(' ', '.', $name)), 'email' => $email]);
        $user->assignRole(RoleName::SalesRepresentative->value);
        $user->warehouses()->attach($warehouse, ['assigned_by' => $user->id]);

        return SalesRepresentative::query()->create([
            'code' => $code, 'user_id' => $user->id, 'primary_warehouse_id' => $warehouse->id,
            'name' => $name, 'email' => $email, 'is_active' => true,
        ]);
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
