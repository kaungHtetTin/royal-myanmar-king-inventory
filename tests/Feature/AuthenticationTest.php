<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_active_user_can_log_in_with_email_and_restore_the_session(): void
    {
        $user = User::factory()->create(['email' => 'admin@example.com', 'password' => 'secret']);
        $user->assignRole(RoleName::OfficeAdmin->value);

        $response = $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', [
            'login' => 'admin@example.com',
            'password' => 'secret',
            'portal' => 'admin',
        ]);

        $response->assertOk()->assertJsonPath('user.id', $user->id);
        $this->assertAuthenticatedAs($user);
        $this->getJson('/api/auth/user')->assertOk()->assertJsonPath('user.username', $user->username);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'event' => 'auth.login_succeeded']);
    }

    public function test_active_user_can_log_in_with_username_and_log_out(): void
    {
        $user = User::factory()->create(['username' => 'office.admin']);
        $user->assignRole(RoleName::OfficeAdmin->value);

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', [
            'login' => 'OFFICE.ADMIN',
            'password' => 'password',
            'portal' => 'admin',
        ])->assertOk();

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/logout')->assertOk();
        $this->withHeader('Origin', 'http://localhost')->getJson('/api/auth/user')->assertUnauthorized();
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'event' => 'auth.logout']);
    }

    public function test_inactive_user_cannot_log_in(): void
    {
        $user = User::factory()->inactive()->create();

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', [
            'login' => $user->email,
            'password' => 'password',
            'portal' => 'sales',
        ])->assertForbidden()->assertJsonPath('code', 'ACCOUNT_INACTIVE');

        $this->assertGuest();
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'event' => 'auth.inactive_login_rejected']);
    }

    public function test_invalid_credentials_use_the_standard_validation_shape(): void
    {
        $user = User::factory()->create();

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', [
            'login' => $user->email,
            'password' => 'incorrect',
            'portal' => 'admin',
        ])->assertUnprocessable()->assertJsonValidationErrors('login');

        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'event' => 'auth.login_failed']);
    }

    public function test_user_cannot_log_in_to_the_wrong_portal(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', [
            'login' => $user->email,
            'password' => 'password',
            'portal' => 'admin',
        ])->assertForbidden()->assertJsonPath('code', 'PORTAL_ACCESS_DENIED');

        $this->assertGuest();
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'event' => 'auth.portal_access_rejected']);
    }

    public function test_representative_needs_an_active_linked_profile_to_log_in(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);

        $payload = [
            'login' => $user->email,
            'password' => 'password',
            'portal' => 'sales',
        ];

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', $payload)
            ->assertForbidden()
            ->assertJsonPath('code', 'REPRESENTATIVE_PROFILE_UNAVAILABLE');

        $warehouse = Warehouse::query()->create(['code' => 'YGN', 'name' => 'Yangon']);
        SalesRepresentative::query()->create([
            'code' => 'SR-001',
            'user_id' => $user->id,
            'primary_warehouse_id' => $warehouse->id,
            'name' => $user->name,
            'is_active' => true,
        ]);

        $this->withHeader('Origin', 'http://localhost')->postJson('/api/auth/login', $payload)->assertOk();
    }

    public function test_sales_only_user_cannot_call_admin_api_with_overlapping_permission(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);

        $this->actingAs($user)->getJson('/api/admin/customers')->assertForbidden();
    }

    public function test_dual_role_user_can_access_both_portals_when_representative_is_active(): void
    {
        $warehouse = Warehouse::query()->create(['code' => 'YGN', 'name' => 'Yangon']);
        $user = User::factory()->create();
        $user->assignRole([RoleName::OfficeAdmin->value, RoleName::SalesRepresentative->value]);
        SalesRepresentative::query()->create([
            'code' => 'SR-001',
            'user_id' => $user->id,
            'primary_warehouse_id' => $warehouse->id,
            'name' => $user->name,
            'is_active' => true,
        ]);

        $this->actingAs($user)->getJson('/api/admin/me')->assertOk();
        $this->getJson('/api/sales/me')->assertOk();
    }

    public function test_every_sales_route_requires_an_active_linked_representative(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);

        $this->actingAs($user)->getJson('/api/sales/me')
            ->assertForbidden()
            ->assertJsonPath('code', 'REPRESENTATIVE_PROFILE_UNAVAILABLE');

        $warehouse = Warehouse::query()->create(['code' => 'YGN', 'name' => 'Yangon']);
        SalesRepresentative::query()->create([
            'code' => 'SR-001',
            'user_id' => $user->id,
            'primary_warehouse_id' => $warehouse->id,
            'name' => $user->name,
            'is_active' => false,
        ]);

        $this->getJson('/api/sales/me')
            ->assertForbidden()
            ->assertJsonPath('code', 'REPRESENTATIVE_PROFILE_UNAVAILABLE');
    }

    public function test_protected_endpoints_reject_unauthenticated_requests(): void
    {
        $endpoints = [
            ['GET', '/api/auth/user'],
            ['POST', '/api/auth/logout'],
            ['GET', '/api/admin/me'],
            ['GET', '/api/admin/access-options'],
            ['GET', '/api/admin/users'],
            ['POST', '/api/admin/users'],
            ['PUT', '/api/admin/users/999'],
            ['PUT', '/api/admin/users/999/access'],
            ['GET', '/api/admin/roles'],
            ['POST', '/api/admin/roles'],
            ['PUT', '/api/admin/roles/999'],
            ['GET', '/api/admin/warehouses'],
            ['POST', '/api/admin/warehouses'],
            ['PUT', '/api/admin/warehouses/999'],
            ['GET', '/api/admin/products'],
            ['GET', '/api/admin/product-options'],
            ['POST', '/api/admin/products'],
            ['PUT', '/api/admin/products/999'],
            ['GET', '/api/admin/vehicles'],
            ['GET', '/api/admin/vehicle-options'],
            ['POST', '/api/admin/vehicles'],
            ['PUT', '/api/admin/vehicles/999'],
            ['GET', '/api/admin/customers'],
            ['GET', '/api/admin/customer-options'],
            ['POST', '/api/admin/customers'],
            ['PUT', '/api/admin/customers/999'],
            ['PUT', '/api/admin/customers/999/credit'],
            ['GET', '/api/admin/representatives/999'],
            ['GET', '/api/admin/representatives'],
            ['GET', '/api/admin/representative-options'],
            ['POST', '/api/admin/representatives'],
            ['PUT', '/api/admin/representatives/999'],
            ['GET', '/api/admin/inventory'],
            ['GET', '/api/admin/inventory/export'],
            ['GET', '/api/admin/inventory/options'],
            ['GET', '/api/admin/inventory/movements'],
            ['GET', '/api/admin/stock-imports'],
            ['POST', '/api/admin/stock-imports'],
            ['PUT', '/api/admin/stock-imports/999'],
            ['POST', '/api/admin/stock-imports/999/post'],
            ['POST', '/api/admin/stock-imports/999/void'],
            ['GET', '/api/admin/stock-adjustments'],
            ['POST', '/api/admin/stock-adjustments'],
            ['PUT', '/api/admin/stock-adjustments/999'],
            ['POST', '/api/admin/stock-adjustments/999/post'],
            ['GET', '/api/admin/warehouse-transfers'],
            ['GET', '/api/admin/warehouse-transfer-options'],
            ['POST', '/api/admin/warehouse-transfers'],
            ['PUT', '/api/admin/warehouse-transfers/999'],
            ['POST', '/api/admin/warehouse-transfers/999/dispatch'],
            ['POST', '/api/admin/warehouse-transfers/999/receive'],
            ['POST', '/api/admin/warehouse-transfers/999/cancel'],
            ['POST', '/api/admin/warehouse-transfers/999/reverse'],
            ['GET', '/api/admin/representative-inventory'],
            ['GET', '/api/admin/representative-transfers'],
            ['GET', '/api/admin/representative-transfer-options'],
            ['POST', '/api/admin/representative-transfers'],
            ['PUT', '/api/admin/representative-transfers/999'],
            ['POST', '/api/admin/representative-transfers/999/dispatch'],
            ['POST', '/api/admin/representative-transfers/999/cancel'],
            ['POST', '/api/admin/representative-transfers/999/reverse'],
            ['GET', '/api/admin/sales'],
            ['POST', '/api/admin/sales/999/void'],
            ['GET', '/api/sales/me'],
            ['GET', '/api/sales/profile'],
            ['GET', '/api/sales/representatives/999'],
            ['GET', '/api/sales/stock'],
            ['GET', '/api/sales/receivings'],
            ['POST', '/api/sales/receivings/999/receive'],
            ['GET', '/api/sales/sales'],
            ['GET', '/api/sales/sales/999'],
            ['GET', '/api/sales/sale-options'],
            ['POST', '/api/sales/sales'],
            ['PUT', '/api/sales/sales/999'],
            ['POST', '/api/sales/sales/999/post'],
            ['GET', '/api/sales/cash-hold'],
            ['GET', '/api/sales/cash-submissions'],
            ['GET', '/api/sales/cash-transactions'],
        ];

        foreach ($endpoints as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }
    }

    public function test_existing_session_is_revoked_after_deactivation(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $user->update(['is_active' => false, 'deactivated_at' => now()]);

        $this->getJson('/api/auth/user')
            ->assertForbidden()
            ->assertJsonPath('code', 'ACCOUNT_INACTIVE');

        $this->assertGuest();
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'event' => 'auth.inactive_session_rejected']);
    }
}
