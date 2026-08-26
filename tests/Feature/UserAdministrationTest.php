<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\AuditLog;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UserAdministrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_super_admin_can_create_user_with_roles_and_warehouses(): void
    {
        $admin = $this->superAdmin();
        $warehouse = $this->warehouse('YGN', 'Yangon');

        $response = $this->actingAs($admin)->postJson('/api/admin/users', [
            'name' => 'Office Operator',
            'username' => 'office.operator',
            'email' => 'office@example.com',
            'password' => 'secret',
            'password_confirmation' => 'secret',
            'is_active' => true,
            'roles' => [RoleName::OfficeAdmin->value],
            'warehouse_ids' => [$warehouse->id],
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.username', 'office.operator')
            ->assertJsonPath('data.roles.0', RoleName::OfficeAdmin->value)
            ->assertJsonPath('data.warehouses.0.id', $warehouse->id)
            ->assertJsonMissingPath('data.password');
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'user.created']);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'user.access_updated']);
        $this->assertTrue(Hash::check('secret', User::query()->findOrFail($response->json('data.id'))->password));
    }

    public function test_user_without_permission_cannot_open_user_management(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);

        $this->actingAs($user)->getJson('/api/admin/users')->assertForbidden();
        $this->getJson('/api/admin/access-options')->assertForbidden();
    }

    public function test_office_admin_only_lists_users_in_shared_warehouses(): void
    {
        $yangon = $this->warehouse('YGN', 'Yangon');
        $mandalay = $this->warehouse('MDY', 'Mandalay');
        $admin = $this->officeManager($yangon);
        $visible = $this->officeManager($yangon, 'Visible User');
        $hidden = $this->officeManager($mandalay, 'Hidden User');

        $response = $this->actingAs($admin)->getJson('/api/admin/users?per_page=100')->assertOk();
        $ids = collect($response->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($visible->id));
        $this->assertFalse($ids->contains($hidden->id));
    }

    public function test_office_admin_cannot_assign_foreign_warehouse_or_super_admin_role(): void
    {
        $yangon = $this->warehouse('YGN', 'Yangon');
        $mandalay = $this->warehouse('MDY', 'Mandalay');
        $admin = $this->officeManager($yangon);
        $target = $this->officeManager($yangon, 'Target User');

        $this->actingAs($admin)->putJson('/api/admin/users/'.$target->id.'/access', [
            'roles' => [RoleName::OfficeAdmin->value],
            'warehouse_ids' => [$mandalay->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('warehouse_ids');

        $this->putJson('/api/admin/users/'.$target->id.'/access', [
            'roles' => [RoleName::SuperAdmin->value],
            'warehouse_ids' => [$yangon->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('roles');
    }

    public function test_user_cannot_deactivate_self_or_change_own_roles(): void
    {
        $admin = $this->superAdmin();

        $this->actingAs($admin)->putJson('/api/admin/users/'.$admin->id, [
            'name' => $admin->name,
            'username' => $admin->username,
            'email' => $admin->email,
            'is_active' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors('is_active');

        $this->putJson('/api/admin/users/'.$admin->id.'/access', [
            'roles' => [RoleName::OfficeAdmin->value],
            'warehouse_ids' => [],
        ])->assertUnprocessable()->assertJsonValidationErrors('roles');
    }

    public function test_deactivation_preserves_user_and_historical_audit_relationships(): void
    {
        $admin = $this->superAdmin();
        $target = User::factory()->create();
        $history = AuditLog::query()->create([
            'actor_id' => $target->id,
            'event' => 'historical.action',
            'subject_type' => User::class,
            'subject_id' => $target->id,
        ]);

        $this->actingAs($admin)->putJson('/api/admin/users/'.$target->id, [
            'name' => $target->name,
            'username' => $target->username,
            'email' => $target->email,
            'is_active' => false,
        ])->assertOk()->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_active' => false]);
        $this->assertDatabaseHas('audit_logs', ['id' => $history->id, 'actor_id' => $target->id, 'subject_id' => $target->id]);
        $this->assertTrue($history->fresh()->actor->is($target));
    }

    public function test_role_management_is_audited_and_super_admin_role_is_protected(): void
    {
        $admin = $this->superAdmin();

        $this->actingAs($admin)->getJson('/api/admin/roles')
            ->assertOk()
            ->assertJsonPath('roles.2.name', RoleName::SuperAdmin->value)
            ->assertJsonPath('roles.2.users_count', 1);

        $role = $this->postJson('/api/admin/roles', [
            'name' => 'auditor',
            'permissions' => [PermissionName::AuditView->value, PermissionName::ReportView->value],
        ])->assertCreated()->json('role');

        $this->putJson('/api/admin/roles/'.$role['id'], [
            'name' => 'audit-reviewer',
            'permissions' => [PermissionName::AuditView->value],
        ])->assertOk()->assertJsonPath('role.name', 'audit-reviewer');

        $superRoleId = $admin->roles()->where('name', RoleName::SuperAdmin->value)->value('id');
        $this->putJson('/api/admin/roles/'.$superRoleId, [
            'name' => RoleName::SuperAdmin->value,
            'permissions' => [],
        ])->assertUnprocessable();

        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'role.created']);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $admin->id, 'event' => 'role.updated']);
    }

    private function superAdmin(): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SuperAdmin->value);

        return $user;
    }

    private function officeManager(Warehouse $warehouse, string $name = 'Office Manager'): User
    {
        $user = User::factory()->create(['name' => $name]);
        $user->assignRole(RoleName::OfficeAdmin->value);
        $user->givePermissionTo(PermissionName::UserManage->value);
        $user->warehouses()->attach($warehouse, ['assigned_by' => $user->id]);

        return $user;
    }

    private function warehouse(string $code, string $name): Warehouse
    {
        return Warehouse::query()->create(compact('code', 'name'));
    }
}
