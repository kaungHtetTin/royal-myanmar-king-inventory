<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_super_admin_can_create_a_normalized_product_and_action_is_audited(): void
    {
        $admin = $this->superAdmin();

        $response = $this->actingAs($admin)->postJson('/api/admin/products', $this->payload([
            'sku' => ' dw-1l ',
            'name' => ' Drinking Water 1 Litre ',
            'category' => ' Drinking Water ',
        ]));

        $response->assertCreated()
            ->assertJsonPath('data.sku', 'DW-1L')
            ->assertJsonPath('data.name', 'Drinking Water 1 Litre')
            ->assertJsonPath('data.selling_price', 1000);
        $this->assertDatabaseHas('products', ['sku' => 'DW-1L', 'selling_price' => 1000]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $admin->id,
            'event' => 'product.created',
            'subject_type' => Product::class,
            'subject_id' => $response->json('data.id'),
        ]);
    }

    public function test_viewer_can_list_products_with_server_filters_and_options(): void
    {
        $viewer = $this->viewer();
        $mandalay = Warehouse::factory()->create(['code' => 'MDY-MAIN', 'name' => 'Mandalay Main']);
        $mandalay->regions()->create(['name' => 'Mandalay', 'is_active' => true]);
        $mandalay->regions()->create(['name' => 'Pyin Oo Lwin', 'is_active' => true]);
        $yangon = Warehouse::factory()->create(['code' => 'YGN-MAIN', 'name' => 'Yangon Main']);
        $yangon->regions()->create(['name' => 'Mingaladon', 'is_active' => true]);
        $yangon->regions()->create(['name' => 'Yangon', 'is_active' => true]);
        $matching = Product::factory()->create(['sku' => 'DW-1L', 'name' => 'Drinking Water', 'category' => 'Water', 'unit' => 'bottle']);
        Product::factory()->inactive()->create(['sku' => 'CUP-01', 'name' => 'Paper Cup', 'category' => 'Accessories', 'unit' => 'piece']);

        $this->actingAs($viewer)->getJson('/api/admin/products?search=DW&status=active&category=Water&unit=bottle&sort=sku&direction=desc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $matching->id)
            ->assertJsonPath('meta.total', 1);

        $this->getJson('/api/admin/products/'.$matching->id)
            ->assertOk()
            ->assertJsonPath('data.id', $matching->id)
            ->assertJsonPath('data.sku', 'DW-1L');

        $this->getJson('/api/admin/product-options')->assertOk()
            ->assertJsonPath('categories.0', 'Accessories')
            ->assertJsonPath('categories.1', 'Water')
            ->assertJsonPath('units.0', 'bottle')
            ->assertJsonPath('regions.0.name', 'Mandalay')
            ->assertJsonPath('regions.0.warehouse.code', 'MDY-MAIN')
            ->assertJsonPath('regions.1.name', 'Pyin Oo Lwin')
            ->assertJsonPath('regions.1.warehouse.code', 'MDY-MAIN')
            ->assertJsonPath('regions.2.name', 'Mingaladon')
            ->assertJsonPath('regions.2.warehouse.code', 'YGN-MAIN')
            ->assertJsonPath('regions.3.name', 'Yangon')
            ->assertJsonPath('regions.3.warehouse.code', 'YGN-MAIN');
    }

    public function test_viewer_without_mutation_permissions_cannot_create_or_edit(): void
    {
        $viewer = $this->viewer();
        $product = Product::factory()->create();

        $this->actingAs($viewer)->postJson('/api/admin/products', $this->payload())->assertForbidden();
        $this->putJson('/api/admin/products/'.$product->id, $this->payload())->assertForbidden();
    }

    public function test_editor_can_update_and_deactivate_without_deleting_product(): void
    {
        $editor = $this->viewer();
        $editor->givePermissionTo(PermissionName::ProductEdit->value);
        $product = Product::factory()->create(['sku' => 'OLD-01']);

        $this->actingAs($editor)->putJson('/api/admin/products/'.$product->id, $this->payload([
            'sku' => 'old-01',
            'name' => 'Archived Product',
            'is_active' => false,
        ]))->assertOk()
            ->assertJsonPath('data.name', 'Archived Product')
            ->assertJsonPath('data.is_active', false);

        $this->assertDatabaseHas('products', ['id' => $product->id, 'is_active' => false]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $editor->id, 'event' => 'product.updated', 'subject_id' => $product->id]);
    }

    public function test_sku_and_barcode_are_unique_and_price_is_whole_non_negative_mmk(): void
    {
        $admin = $this->superAdmin();
        Product::factory()->create(['sku' => 'DW-1L', 'barcode' => '123456789']);

        $this->actingAs($admin)->postJson('/api/admin/products', $this->payload(['sku' => 'dw-1l']))
            ->assertUnprocessable()->assertJsonValidationErrors('sku');
        $this->postJson('/api/admin/products', $this->payload(['barcode' => '123456789']))
            ->assertUnprocessable()->assertJsonValidationErrors('barcode');
        $this->postJson('/api/admin/products', $this->payload(['selling_price' => -1]))
            ->assertUnprocessable()->assertJsonValidationErrors('selling_price');
        $this->postJson('/api/admin/products', $this->payload(['selling_price' => 10.5]))
            ->assertUnprocessable()->assertJsonValidationErrors('selling_price');
    }

    /** @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'sku' => 'MW-500ML',
            'name' => 'Mineral Water 500 ml',
            'category' => 'Mineral Water',
            'unit' => 'bottle',
            'selling_price' => 1000,
            'barcode' => '8850000000028',
            'description' => 'Retail bottle.',
            'is_active' => true,
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
        $user->givePermissionTo(PermissionName::ProductView->value);

        return $user;
    }
}
