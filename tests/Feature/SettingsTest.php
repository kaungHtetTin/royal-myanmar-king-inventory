<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\ApplicationSetting;
use App\Models\User;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_public_branding_has_safe_defaults(): void
    {
        $this->getJson('/api/branding')
            ->assertOk()
            ->assertJsonPath('business_name', 'StockFlow')
            ->assertJsonPath('primary_color', '#087f74');
    }

    public function test_super_admin_can_update_profile_branding_assets_and_operational_defaults(): void
    {
        Storage::fake('public');
        $user = User::factory()->create([
            'email' => 'admin@example.com',
            'password' => 'old-password',
            'username' => 'superadmin',
        ]);
        $user->assignRole(RoleName::SuperAdmin->value);

        $this->actingAs($user)->getJson('/api/admin/settings')
            ->assertOk()
            ->assertJsonPath('profile.username', 'superadmin')
            ->assertJsonPath('operations.currency_code', 'MMK')
            ->assertJsonPath('operations.payment_methods.0.key', 'cash')
            ->assertJsonPath('operations.payment_methods.1.key', 'banking');

        $this->putJson('/api/admin/settings/profile', [
            'name' => 'System Owner',
            'username' => 'owner',
            'email' => 'owner@example.com',
            'current_password' => 'old-password',
            'password' => 'secret',
            'password_confirmation' => 'secret',
        ])->assertOk()->assertJsonPath('profile.username', 'owner');

        $pixel = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
        $this->post('/api/admin/settings', [
            'business_name' => 'Valley Distribution',
            'business_tagline' => 'Warehouse operations',
            'primary_color' => '#245e57',
            'business_email' => 'office@example.com',
            'business_phone' => '09-123456789',
            'business_address' => 'Yangon, Myanmar',
            'currency_code' => 'MMK',
            'timezone' => 'Asia/Yangon',
            'low_stock_threshold' => 25,
            'invoice_footer' => 'Thank you for your business.',
            'payment_methods' => [
                ['key' => 'cash', 'name' => 'Cash', 'adds_to_cash_hold' => true, 'is_active' => true],
                ['key' => 'banking', 'name' => 'Banking', 'adds_to_cash_hold' => false, 'is_active' => true],
                ['key' => 'mobile_banking', 'name' => 'Mobile banking', 'adds_to_cash_hold' => false, 'is_active' => true],
            ],
            'logo' => UploadedFile::fake()->createWithContent('logo.png', $pixel),
            'favicon' => UploadedFile::fake()->createWithContent('favicon.png', $pixel),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('branding.business_name', 'Valley Distribution')
            ->assertJsonPath('operations.low_stock_threshold', 25)
            ->assertJsonPath('operations.payment_methods.2.name', 'Mobile banking');

        $settings = ApplicationSetting::query()->firstOrFail();
        Storage::disk('public')->assertExists($settings->logo_path);
        Storage::disk('public')->assertExists($settings->favicon_path);
        $this->getJson('/api/branding')->assertOk()->assertJsonPath('invoice_footer', 'Thank you for your business.');
        $this->get('/api/branding/assets/logo')->assertOk();
        $this->assertDatabaseHas('audit_logs', ['event' => 'settings.profile_updated']);
        $this->assertDatabaseHas('audit_logs', ['event' => 'settings.application_updated']);
    }

    public function test_settings_require_role_management_permission(): void
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);

        $this->actingAs($user)->getJson('/api/admin/settings')->assertForbidden();
    }
}
