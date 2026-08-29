<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\User;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Phase2MasterDataTest extends TestCase
{
    use RefreshDatabase;

    public function test_all_phase_two_master_records_can_be_created_linked_listed_and_selected(): void
    {
        $this->seed(AccessControlSeeder::class);
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);
        $this->actingAs($admin);

        $warehouse = $this->postJson('/api/admin/warehouses', [
            'code' => 'YGN-P2', 'name' => 'Phase 2 Warehouse',
            'address' => '', 'phone' => '', 'notes' => '', 'is_active' => true,
        ])->assertCreated()->json('data');
        $region = $this->postJson('/api/admin/warehouses/'.$warehouse['id'].'/regions', [
            'name' => 'Yangon', 'notes' => '', 'is_active' => true,
        ])->assertCreated()->json('data');
        $way = $this->postJson('/api/admin/regions/'.$region['id'].'/ways', [
            'name' => 'Hlaing', 'notes' => '', 'is_active' => true,
        ])->assertCreated()->json('data');
        $product = $this->postJson('/api/admin/products', [
            'sku' => 'P2-WATER', 'name' => 'Phase 2 Water', 'category' => 'Drinking Water', 'unit' => 'bottle',
            'selling_price' => 1200, 'barcode' => '8990000000012', 'description' => '', 'is_active' => true,
        ])->assertCreated()->json('data');
        $vehicle = $this->postJson('/api/admin/vehicles', [
            'vehicle_number' => 'YGN-P2-001', 'vehicle_type' => 'Van', 'brand' => 'Toyota', 'model' => 'Hiace',
            'sales_representative_id' => null, 'notes' => '', 'is_active' => true,
        ])->assertCreated()->json('data');
        $customer = $this->postJson('/api/admin/customers', [
            'warehouse_id' => $warehouse['id'], 'code' => 'CUS-P2', 'name' => 'Phase 2 Shop', 'customer_type' => 'Shop',
            'phone' => '09-100000001', 'way_id' => $way['id'], 'address' => '',
            'credit_allowed' => true, 'credit_limit' => 1000000, 'notes' => '', 'is_active' => true,
        ])->assertCreated()->json('data');
        $representative = $this->postJson('/api/admin/representatives', [
            'code' => 'SR-P2', 'name' => 'Phase Two Representative', 'phone' => '09-100000002', 'email' => null,
            'username' => 'phase.two', 'password' => 'password', 'password_confirmation' => 'password',
            'primary_warehouse_id' => $warehouse['id'], 'region_ids' => [$region['id']], 'vehicle_id' => $vehicle['id'],
            'notes' => '', 'is_active' => true,
        ])->assertCreated()->json('data');

        $this->getJson('/api/admin/warehouses?search=YGN-P2')->assertOk()->assertJsonPath('data.0.id', $warehouse['id']);
        $this->getJson('/api/admin/products?search=P2-WATER')->assertOk()->assertJsonPath('data.0.id', $product['id']);
        $this->getJson('/api/admin/vehicles?assignment=assigned')->assertOk()
            ->assertJsonPath('data.0.representative.id', $representative['id']);
        $this->getJson('/api/admin/customers?warehouse_id='.$warehouse['id'])->assertOk()
            ->assertJsonPath('data.0.id', $customer['id']);
        $this->getJson('/api/admin/representatives?warehouse_id='.$warehouse['id'])->assertOk()
            ->assertJsonPath('data.0.vehicle.id', $vehicle['id']);

        $this->getJson('/api/admin/customer-options')->assertOk()->assertJsonPath('warehouses.0.id', $warehouse['id']);
        $this->getJson('/api/admin/representative-options')->assertOk()->assertJsonPath('vehicles.0.id', $vehicle['id']);
        $this->getJson('/api/admin/vehicle-options')->assertOk()
            ->assertJsonPath('representatives.0.id', $representative['id'])
            ->assertJsonPath('representatives.0.vehicle_id', $vehicle['id']);
    }
}
