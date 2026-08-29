<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\RepresentativeAccess;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RepresentativeOwnershipTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_representative_can_read_own_profile_but_not_another_profile(): void
    {
        $warehouse = $this->warehouse('YGN', 'Yangon');
        [$firstUser, $first] = $this->representative('SR-001', $warehouse);
        [, $second] = $this->representative('SR-002', $warehouse);

        $this->actingAs($firstUser)->getJson('/api/sales/profile')
            ->assertOk()
            ->assertJsonPath('representative.id', $first->id);

        $this->getJson('/api/sales/representatives/'.$first->id)->assertOk();
        $this->getJson('/api/sales/representatives/'.$second->id)->assertForbidden();
    }

    public function test_representative_can_update_own_profile_and_password(): void
    {
        $warehouse = $this->warehouse('YGN', 'Yangon');
        [$user, $representative] = $this->representative('SR-001', $warehouse);
        $user->update(['password' => 'old-password']);

        $this->actingAs($user)->putJson('/api/sales/profile', [
            'name' => 'Updated Representative',
            'username' => 'updated.rep',
            'email' => 'updated@example.com',
            'phone' => '0912345678',
        ])->assertOk()
            ->assertJsonPath('user.username', 'updated.rep')
            ->assertJsonPath('representative.phone', '0912345678');

        $this->assertDatabaseHas('users', ['id' => $user->id, 'name' => 'Updated Representative']);
        $this->assertDatabaseHas('sales_representatives', [
            'id' => $representative->id,
            'name' => 'Updated Representative',
        ]);
        $this->assertCount(1, $representative->fresh()->regions);
        $this->putJson('/api/sales/profile/password', [
            'current_password' => 'wrong-password',
            'password' => 'secret',
            'password_confirmation' => 'secret',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');
        $this->putJson('/api/sales/profile/password', [
            'current_password' => 'old-password',
            'password' => 'secret',
            'password_confirmation' => 'secret',
        ])->assertOk();

        $this->assertTrue(Hash::check('secret', $user->fresh()->password));
        $this->assertDatabaseHas('audit_logs', ['event' => 'sales.profile_updated', 'actor_id' => $user->id]);
        $this->assertDatabaseHas('audit_logs', ['event' => 'sales.password_updated', 'actor_id' => $user->id]);
    }

    public function test_office_admin_can_only_read_representatives_in_assigned_warehouses(): void
    {
        $assignedWarehouse = $this->warehouse('YGN', 'Yangon');
        $otherWarehouse = $this->warehouse('MDY', 'Mandalay');
        [, $assignedRepresentative] = $this->representative('SR-001', $assignedWarehouse);
        [, $otherRepresentative] = $this->representative('SR-002', $otherWarehouse);
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::OfficeAdmin->value);
        $admin->givePermissionTo(PermissionName::RepresentativeView->value);
        $admin->warehouses()->attach($assignedWarehouse, ['assigned_by' => $admin->id]);

        $this->actingAs($admin)->getJson('/api/admin/representatives/'.$assignedRepresentative->id)->assertOk();
        $this->getJson('/api/admin/representatives/'.$otherRepresentative->id)->assertForbidden();
    }

    public function test_super_admin_can_read_every_representative(): void
    {
        $warehouse = $this->warehouse('YGN', 'Yangon');
        [, $representative] = $this->representative('SR-001', $warehouse);
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);

        $this->actingAs($admin)->getJson('/api/admin/representatives/'.$representative->id)->assertOk();
    }

    public function test_representative_scope_ignores_requested_foreign_ids(): void
    {
        $warehouse = $this->warehouse('YGN', 'Yangon');
        [$user, $owned] = $this->representative('SR-001', $warehouse);
        $this->representative('SR-002', $warehouse);

        $ids = app(RepresentativeAccess::class)
            ->scope(SalesRepresentative::query(), $user)
            ->pluck('id')
            ->all();

        $this->assertSame([$owned->id], $ids);
    }

    private function warehouse(string $code, string $name): Warehouse
    {
        $warehouse = Warehouse::query()->create(compact('code', 'name'));
        $region = $warehouse->regions()->create(['name' => $name.' Region', 'is_active' => true]);
        $region->ways()->create(['code' => 'WAY-'.$code, 'name' => $name.' Way', 'is_active' => true]);

        return $warehouse;
    }

    /** @return array{User, SalesRepresentative} */
    private function representative(string $code, Warehouse $warehouse): array
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::query()->create([
            'code' => $code,
            'user_id' => $user->id,
            'primary_warehouse_id' => $warehouse->id,
            'name' => $user->name,
            'email' => $user->email,
            'is_active' => true,
        ]);
        $representative->regions()->sync([$warehouse->regions()->firstOrFail()->id]);

        return [$user, $representative];
    }
}
