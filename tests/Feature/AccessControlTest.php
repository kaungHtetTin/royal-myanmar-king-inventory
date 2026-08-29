<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\WarehouseAccess;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_office_admin_needs_feature_permission_for_admin_endpoint(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);
        $user->revokePermissionTo(PermissionName::DashboardView->value);
        $user->roles()->firstOrFail()->revokePermissionTo(PermissionName::DashboardView->value);

        $this->actingAs($user)->getJson('/api/admin/me')->assertForbidden();

        $user->givePermissionTo(PermissionName::DashboardView->value);
        $this->getJson('/api/admin/me')->assertOk();
    }

    public function test_representative_cannot_cross_the_admin_route_boundary(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);
        $warehouse = Warehouse::query()->create(['code' => 'YGN', 'name' => 'Yangon']);
        SalesRepresentative::query()->create([
            'code' => 'SR-001',
            'user_id' => $user->id,
            'primary_warehouse_id' => $warehouse->id,
            'name' => $user->name,
            'is_active' => true,
        ]);

        $this->actingAs($user)->getJson('/api/sales/me')->assertOk();
        $this->getJson('/api/admin/me')->assertForbidden();
    }

    public function test_super_admin_bypasses_feature_and_warehouse_assignment_checks(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SuperAdmin->value);
        $warehouse = Warehouse::query()->create(['code' => 'YGN', 'name' => 'Yangon']);

        $this->actingAs($user)->getJson('/api/admin/me')->assertOk();
        $this->assertTrue(app(WarehouseAccess::class)->allows($user, $warehouse));
    }

    public function test_office_admin_is_limited_to_assigned_warehouses(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);
        $assigned = Warehouse::query()->create(['code' => 'YGN', 'name' => 'Yangon']);
        $unassigned = Warehouse::query()->create(['code' => 'MDY', 'name' => 'Mandalay']);
        $user->warehouses()->attach($assigned, ['assigned_by' => $user->id]);

        $access = app(WarehouseAccess::class);

        $this->assertTrue($access->allows($user, $assigned));
        $this->assertFalse($access->allows($user, $unassigned));
        $this->assertSame([$assigned->id], $access->scope(Warehouse::query(), $user)->pluck('id')->all());
    }
}
