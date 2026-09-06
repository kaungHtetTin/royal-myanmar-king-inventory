<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Vehicle;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VehicleManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_assignments_can_be_managed_from_both_detail_pages(): void
    {
        $this->actingAs($this->superAdmin());
        $rep = SalesRepresentative::factory()->create();
        $otherRep = SalesRepresentative::factory()->create();
        $first = Vehicle::factory()->create(['sales_representative_id' => null]);
        $second = Vehicle::factory()->create(['sales_representative_id' => null]);
        $this->getJson("/api/admin/vehicles/{$first->id}")->assertOk()->assertJsonPath('data.representative', null);
        $this->getJson("/api/admin/representatives/{$rep->id}/assignment")->assertOk();
        $this->putJson("/api/admin/representatives/{$rep->id}/assignment", ['vehicle_id' => $first->id])->assertOk();
        $this->getJson("/api/admin/vehicles/{$first->id}")->assertOk()->assertJsonPath('data.representative.id', $rep->id);
        $this->putJson("/api/admin/representatives/{$otherRep->id}/assignment", ['vehicle_id' => $first->id])->assertUnprocessable();
        $this->putJson("/api/admin/vehicles/{$second->id}/assignment", ['representative_id' => $rep->id])->assertUnprocessable();
        $this->putJson("/api/admin/representatives/{$rep->id}/assignment", ['vehicle_id' => $second->id])->assertOk();
        $this->assertDatabaseHas('vehicles', ['id' => $first->id, 'sales_representative_id' => null]);
        $this->putJson("/api/admin/vehicles/{$second->id}/assignment", ['representative_id' => null])->assertOk();
        $this->putJson("/api/admin/vehicles/{$first->id}/assignment", ['representative_id' => $otherRep->id])->assertOk();
        $this->getJson("/api/admin/vehicles/{$first->id}/assignment")->assertOk();
        $this->assertDatabaseHas('vehicles', ['id' => $first->id, 'sales_representative_id' => $otherRep->id]);
        $this->assertDatabaseHas('audit_logs', ['event' => 'vehicle.representative_assigned']);
    }

    public function test_active_trip_blocks_assignment_changes_and_trip_requires_the_assigned_vehicle(): void
    {
        $admin = $this->superAdmin();
        $this->actingAs($admin);
        $rep = SalesRepresentative::factory()->create();
        $region = $rep->primaryWarehouse->regions()->create(['name' => 'Assignment region', 'is_active' => true]);
        $rep->regions()->sync([$region->id]);
        $vehicle = Vehicle::factory()->create(['sales_representative_id' => $rep->id]);
        $other = Vehicle::factory()->create(['sales_representative_id' => null]);
        $input = ['title' => 'Assigned trip', 'warehouse_id' => $rep->primary_warehouse_id, 'region_id' => $region->id, 'sales_representative_id' => $rep->id, 'vehicle_id' => $other->id];
        $this->postJson('/api/admin/trips', $input)->assertUnprocessable()->assertJsonValidationErrors('vehicle_id');
        $input['vehicle_id'] = $vehicle->id;
        $this->postJson('/api/admin/trips', $input)->assertCreated();
        $this->putJson("/api/admin/representatives/{$rep->id}/assignment", ['vehicle_id' => null])->assertUnprocessable();
        $this->putJson("/api/admin/vehicles/{$vehicle->id}/assignment", ['representative_id' => null])->assertUnprocessable();
        $this->assertDatabaseHas('vehicles', ['id' => $vehicle->id, 'sales_representative_id' => $rep->id]);
    }

    public function test_trip_planning_blocks_busy_representatives_but_allows_finished_trips(): void
    {
        $this->actingAs($this->superAdmin());
        $rep = SalesRepresentative::factory()->create();
        $region = $rep->primaryWarehouse->regions()->create(['name' => 'Planning region', 'is_active' => true]);
        $rep->regions()->sync([$region->id]);
        $vehicle = Vehicle::factory()->create(['sales_representative_id' => $rep->id]);
        $input = ['title' => 'Planned trip', 'warehouse_id' => $rep->primary_warehouse_id, 'region_id' => $region->id, 'sales_representative_id' => $rep->id, 'vehicle_id' => $vehicle->id];
        $tripId = $this->postJson('/api/admin/trips', $input)->assertCreated()->json('data.id');

        foreach (['planning', 'operation', 'ending'] as $status) {
            \App\Models\Trip::query()->findOrFail($tripId)->update(['status' => $status]);
            $this->getJson('/api/admin/trip-options')->assertOk()->assertJsonPath('representatives.0.has_active_trip', true);
            $this->postJson('/api/admin/trips', $input)->assertConflict()->assertJsonPath('code', 'REPRESENTATIVE_HAS_ACTIVE_TRIP');
            $this->assertDatabaseCount('trips', 1);
        }

        foreach (['completed', 'cancelled'] as $status) {
            \App\Models\Trip::query()->findOrFail($tripId)->update(['status' => $status]);
            $this->getJson('/api/admin/trip-options')->assertOk()->assertJsonPath('representatives.0.has_active_trip', false);
            $tripId = $this->postJson('/api/admin/trips', $input)->assertCreated()->json('data.id');
        }
    }

    public function test_assignment_mutations_require_edit_permission(): void
    {
        $viewer = $this->viewer();
        $vehicle = Vehicle::factory()->create();
        $this->actingAs($viewer)->getJson("/api/admin/vehicles/{$vehicle->id}")->assertOk();
        $this->putJson("/api/admin/vehicles/{$vehicle->id}/assignment", ['representative_id' => null])->assertForbidden();
    }

    public function test_super_admin_can_create_and_assign_a_normalized_vehicle_with_audit(): void
    {
        $admin = $this->superAdmin();
        $representative = SalesRepresentative::factory()->create(['code' => 'SR-001', 'name' => 'Ko Aung']);

        $response = $this->actingAs($admin)->postJson('/api/admin/vehicles', $this->payload([
            'vehicle_number' => ' ygn-3n-4821 ',
            'sales_representative_id' => $representative->id,
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.vehicle_number', 'YGN-3N-4821')
            ->assertJsonPath('data.representative.id', $representative->id)
            ->assertJsonPath('data.vehicle_type', 'Van');
        $this->assertDatabaseHas('vehicles', ['vehicle_number' => 'YGN-3N-4821', 'sales_representative_id' => $representative->id]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $admin->id,
            'event' => 'vehicle.created',
            'subject_type' => Vehicle::class,
            'subject_id' => $response->json('data.id'),
        ]);
    }

    public function test_viewer_can_filter_vehicle_directory_and_load_assignment_options(): void
    {
        $viewer = $this->viewer();
        $representative = SalesRepresentative::factory()->create(['code' => 'SR-001', 'name' => 'Ko Aung']);
        $matching = Vehicle::factory()->create(['vehicle_number' => 'YGN-3N-4821', 'vehicle_type' => 'Van', 'sales_representative_id' => $representative->id]);
        Vehicle::factory()->inactive()->create(['vehicle_number' => 'MDY-01', 'vehicle_type' => 'Truck']);

        $this->actingAs($viewer)->getJson('/api/admin/vehicles?search=Aung&status=active&type=Van&assignment=assigned&sort=vehicle_number&direction=desc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $matching->id)
            ->assertJsonPath('meta.total', 1);

        $this->getJson('/api/admin/vehicle-options')->assertOk()
            ->assertJsonPath('representatives.0.id', $representative->id)
            ->assertJsonPath('representatives.0.vehicle_id', $matching->id)
            ->assertJsonPath('types.1', 'Van');
    }

    public function test_viewer_without_mutation_permissions_cannot_create_or_edit(): void
    {
        $viewer = $this->viewer();
        $vehicle = Vehicle::factory()->create();

        $this->actingAs($viewer)->postJson('/api/admin/vehicles', $this->payload())->assertForbidden();
        $this->putJson('/api/admin/vehicles/'.$vehicle->id, $this->payload())->assertForbidden();
    }

    public function test_editor_can_update_deactivate_and_unassign_without_deleting_vehicle(): void
    {
        $editor = $this->viewer();
        $editor->givePermissionTo(PermissionName::VehicleEdit->value);
        $representative = SalesRepresentative::factory()->create();
        $vehicle = Vehicle::factory()->create(['sales_representative_id' => $representative->id]);

        $this->actingAs($editor)->putJson('/api/admin/vehicles/'.$vehicle->id, $this->payload([
            'vehicle_number' => $vehicle->vehicle_number,
            'vehicle_type' => 'Truck',
            'sales_representative_id' => null,
            'is_active' => false,
        ]))->assertOk()
            ->assertJsonPath('data.vehicle_type', 'Truck')
            ->assertJsonPath('data.representative', null)
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('vehicles', ['id' => $vehicle->id, 'sales_representative_id' => null, 'is_active' => false]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $editor->id, 'event' => 'vehicle.updated', 'subject_id' => $vehicle->id]);
    }

    public function test_vehicle_number_and_representative_assignment_are_unique_and_inactive_representatives_are_rejected(): void
    {
        $admin = $this->superAdmin();
        $assigned = SalesRepresentative::factory()->create();
        $inactive = SalesRepresentative::factory()->inactive()->create();
        Vehicle::factory()->create(['vehicle_number' => 'YGN-3N-4821', 'sales_representative_id' => $assigned->id]);

        $this->actingAs($admin)->postJson('/api/admin/vehicles', $this->payload(['vehicle_number' => 'ygn-3n-4821']))
            ->assertUnprocessable()->assertJsonValidationErrors('vehicle_number');
        $this->postJson('/api/admin/vehicles', $this->payload(['sales_representative_id' => $assigned->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('sales_representative_id');
        $this->postJson('/api/admin/vehicles', $this->payload(['sales_representative_id' => $inactive->id]))
            ->assertUnprocessable()->assertJsonValidationErrors('sales_representative_id');
    }

    /** @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'vehicle_number' => 'MDY-5J-1934',
            'vehicle_type' => 'Van',
            'brand' => 'Toyota',
            'model' => 'Hiace',
            'sales_representative_id' => null,
            'is_active' => true,
            'notes' => 'Distribution route vehicle.',
        ], $overrides);
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SuperAdmin->value);

        return $user;
    }

    private function viewer(): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);
        $user->givePermissionTo(PermissionName::VehicleView->value);

        return $user;
    }
}
