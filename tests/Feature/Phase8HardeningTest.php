<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Logging\CustomizeJsonFormatter;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Monolog\Handler\StreamHandler;
use Monolog\Logger;
use Tests\TestCase;

class Phase8HardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_pwa_manifest_service_worker_and_nested_shell_links_are_present(): void
    {
        $manifest = json_decode(file_get_contents(public_path('manifest.webmanifest')), true, flags: JSON_THROW_ON_ERROR);
        $worker = file_get_contents(public_path('service-worker.js'));

        $this->assertSame('standalone', $manifest['display']);
        $this->assertSame('./admin/dashboard', $manifest['start_url']);
        $this->assertSame('./', $manifest['scope']);
        $this->assertContains('maskable', array_column($manifest['icons'], 'purpose'));
        $this->assertStringContainsString('stockflow-shell-v3', $worker);
        $this->assertStringContainsString("new URL('build/manifest.json', scopeUrl)", $worker);
        $this->assertStringContainsString("relativePath.startsWith('api/')", $worker);

        $response = $this->get('/admin/login');
        $response->assertOk();
        $response->assertSee('href="/manifest.webmanifest"', false);
        $response->assertSee('href="/icons/stockflow.svg"', false);
        $this->assertStringContainsString('request()->getBaseUrl()', file_get_contents(resource_path('views/app.blade.php')));
    }

    public function test_health_and_spa_responses_include_security_and_request_headers(): void
    {
        $headers = ['X-Request-ID' => 'phase8-request-0001'];
        $this->withHeaders($headers)->getJson('/api/health')->assertOk()
            ->assertJsonPath('status', 'ok')->assertJsonPath('checks.database', true)->assertJsonPath('checks.cache', true)
            ->assertHeader('X-Request-ID', 'phase8-request-0001')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Referrer-Policy', 'same-origin');

        $this->get('/admin/login')->assertOk()
            ->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()');

        $this->assertContains('throttle:api', app('router')->getMiddlewareGroups()['api']);
    }

    public function test_structured_log_channel_emits_machine_readable_context(): void
    {
        $stream = fopen('php://memory', 'w+');
        $logger = new Logger('phase8', [new StreamHandler($stream)]);
        (new CustomizeJsonFormatter)($logger);

        $logger->warning('phase8 probe', ['request_id' => 'phase8-request-0002', 'user_id' => 42]);
        rewind($stream);
        $record = json_decode(stream_get_contents($stream), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame('phase8 probe', $record['message']);
        $this->assertSame('WARNING', $record['level_name']);
        $this->assertSame('phase8-request-0002', $record['context']['request_id']);
        $this->assertSame(42, $record['context']['user_id']);
    }

    public function test_every_business_api_route_retains_authentication_activity_and_authorization_middleware(): void
    {
        $routes = collect(app('router')->getRoutes()->getRoutes())
            ->filter(fn (Route $route) => str_starts_with($route->uri(), 'api/admin/') || str_starts_with($route->uri(), 'api/sales/'));

        $this->assertGreaterThan(50, $routes->count());
        foreach ($routes as $route) {
            $middleware = collect($route->gatherMiddleware());
            $this->assertContains('auth:sanctum', $middleware, "{$route->uri()} lacks authentication.");
            $this->assertContains('active', $middleware, "{$route->uri()} lacks active-user enforcement.");
            if (str_starts_with($route->uri(), 'api/admin/')) {
                $this->assertTrue($middleware->contains(fn (string $name) => str_starts_with($name, 'permission:')), "{$route->uri()} lacks permission authorization.");
            } else {
                $this->assertTrue($middleware->contains(fn (string $name) => str_starts_with($name, 'role:')), "{$route->uri()} lacks representative-role authorization.");
            }
        }
    }

    public function test_sensitive_authentication_fields_are_never_serialized(): void
    {
        $user = User::factory()->create(['password' => 'not-plain-text']);
        $serialized = $user->fresh()->toArray();

        $this->assertArrayNotHasKey('password', $serialized);
        $this->assertArrayNotHasKey('remember_token', $serialized);
        $this->assertNotSame('not-plain-text', $user->fresh()->getRawOriginal('password'));
    }

    public function test_common_management_reads_remain_paginated_and_query_bounded_at_expected_volume(): void
    {
        $this->seed(AccessControlSeeder::class);
        $warehouse = Warehouse::factory()->create();
        Product::factory()->count(60)->create();
        Customer::factory()->count(1000)->create(['warehouse_id' => $warehouse->id]);
        SalesRepresentative::factory()->count(100)->create(['primary_warehouse_id' => $warehouse->id]);
        $admin = User::factory()->create();
        $admin->assignRole(RoleName::SuperAdmin->value);

        foreach ([['api/admin/products?per_page=20', 60], ['api/admin/customers?per_page=20', 1000], ['api/admin/representatives?per_page=20', 100]] as [$uri, $total]) {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $started = hrtime(true);
            $this->actingAs($admin)->getJson($uri)->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('meta.total', $total);
            $elapsedMilliseconds = (hrtime(true) - $started) / 1_000_000;
            $this->assertLessThanOrEqual(15, count(DB::getQueryLog()), "{$uri} caused too many queries.");
            $this->assertLessThan(3000, $elapsedMilliseconds, "{$uri} exceeded the expected read latency budget.");
        }
    }
}
