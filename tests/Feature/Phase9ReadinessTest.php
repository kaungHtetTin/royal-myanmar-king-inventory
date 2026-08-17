<?php

namespace Tests\Feature;

use App\Enums\RoleName;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Services\MasterDataTemplateValidator;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class Phase9ReadinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_release_readiness_passes_with_complete_foundation_and_reconciled_empty_balances(): void
    {
        $this->seed(AccessControlSeeder::class);
        $warehouse = Warehouse::factory()->create(['is_active' => true]);
        Product::factory()->create(['is_active' => true]);
        Customer::factory()->create(['warehouse_id' => $warehouse->id, 'is_active' => true]);
        $admin = User::factory()->create(['is_active' => true]);
        $admin->assignRole(RoleName::SuperAdmin->value);

        $exit = Artisan::call('inventory:readiness', ['--json' => true]);
        $output = Artisan::output();
        $payload = json_decode($output, true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(0, $exit, $output);
        $this->assertSame('ready', $payload['status']);
        $this->assertSame('local', $payload['stage']);
        $this->assertSame(0, $payload['summary']['failed']);
    }

    public function test_readiness_rejects_an_unknown_release_stage(): void
    {
        $exit = Artisan::call('inventory:readiness', ['--stage' => 'preview', '--json' => true]);
        $payload = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(1, $exit);
        $this->assertSame('not_ready', $payload['status']);
        $this->assertSame('preview', $payload['stage']);
        $this->assertSame('readiness_stage', $payload['checks'][0]['name']);
    }

    public function test_readiness_fails_when_a_materialized_balance_does_not_reconcile(): void
    {
        $this->seed(AccessControlSeeder::class);
        $warehouse = Warehouse::factory()->create(['is_active' => true]);
        $product = Product::factory()->create(['is_active' => true]);
        Customer::factory()->create(['warehouse_id' => $warehouse->id, 'is_active' => true]);
        $admin = User::factory()->create(['is_active' => true]);
        $admin->assignRole(RoleName::SuperAdmin->value);
        WarehouseInventory::query()->create(['warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'quantity' => 5]);

        $exit = Artisan::call('inventory:readiness', ['--json' => true]);
        $payload = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(1, $exit);
        $this->assertSame('not_ready', $payload['status']);
        $this->assertFalse(collect($payload['checks'])->firstWhere('name', 'reconcile_warehouse_inventory')['ok']);
    }

    public function test_production_mode_cannot_pass_with_placeholder_environment_or_ownership(): void
    {
        $this->seed(AccessControlSeeder::class);
        $exit = Artisan::call('inventory:readiness', ['--production' => true, '--json' => true]);
        $payload = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

        $this->assertSame(1, $exit);
        $this->assertSame('not_ready', $payload['status']);
        $contacts = collect($payload['checks'])->firstWhere('name', 'operations_contacts');
        $pilot = collect($payload['checks'])->firstWhere('name', 'pilot_scope');
        $signoff = collect($payload['checks'])->firstWhere('name', 'rollout_signoff_evidence');
        $this->assertNotNull($contacts, json_encode($payload));
        $this->assertNotNull($pilot, json_encode($payload));
        $this->assertNotNull($signoff, json_encode($payload));
        $this->assertFalse($contacts['ok']);
        $this->assertFalse($pilot['ok']);
        $this->assertFalse($signoff['ok']);
    }

    public function test_production_preflight_and_final_gates_require_their_stage_evidence(): void
    {
        $this->seed(AccessControlSeeder::class);
        $warehouse = Warehouse::factory()->create(['code' => 'WH-PILOT', 'is_active' => true]);
        Product::factory()->create(['is_active' => true]);
        Customer::factory()->create(['warehouse_id' => $warehouse->id, 'is_active' => true]);
        $admin = User::factory()->create(['is_active' => true]);
        $admin->assignRole(RoleName::SuperAdmin->value);
        $representativeUser = User::factory()->create(['is_active' => true]);
        $representativeUser->assignRole(RoleName::SalesRepresentative->value);
        $representativeUser->warehouses()->attach($warehouse);
        SalesRepresentative::factory()->create([
            'code' => 'SR-PILOT',
            'user_id' => $representativeUser->id,
            'primary_warehouse_id' => $warehouse->id,
            'is_active' => true,
        ]);

        $directory = storage_path('framework/testing/phase9-ready-'.bin2hex(random_bytes(4)));
        File::ensureDirectoryExists($directory.'/backups');
        File::put($directory.'/backups/inventory-ready.sql', '-- verified test backup');
        $approvedAt = now()->subMinute()->toISOString();
        $evidence = collect(['uat', 'opening_balances', 'restore', 'pilot'])
            ->mapWithKeys(fn ($section) => [$section => [
                'approved_by' => 'Named Owner',
                'approved_at' => $approvedAt,
                'evidence_reference' => "record-{$section}",
            ]])->all();
        $evidence['pilot']['warehouse_code'] = 'WH-PILOT';
        $evidence['pilot']['representative_code'] = 'SR-PILOT';
        $evidence['release'] = ['version' => '1.0.0', 'deployment_id' => 'release-test-001'];
        File::put($directory.'/signoff.json', json_encode($evidence, JSON_THROW_ON_ERROR));

        config()->set([
            'app.env' => 'production',
            'app.debug' => false,
            'app.key' => 'base64:'.base64_encode(random_bytes(32)),
            'app.url' => 'https://inventory.example.test/app',
            'session.secure' => true,
            'session.http_only' => true,
            'session.encrypt' => true,
            'logging.default' => 'stack',
            'logging.channels.stack.channels' => ['structured'],
            'cors.allowed_origins' => ['https://inventory.example.test'],
            'database.connections.mysql.username' => 'inventory_app',
            'database.connections.mysql.password' => 'test-secret',
            'operations.release.version' => '1.0.0',
            'operations.release.deployment_id' => 'release-test-001',
            'operations.contacts' => array_fill_keys([
                'business_owner', 'technical_owner', 'security', 'incident_primary',
                'incident_escalation', 'database_recovery_owner',
            ], 'Named Owner +95 1 555 0100'),
            'operations.backup.directory' => $directory.'/backups',
            'operations.backup.maximum_age_hours' => 26,
            'operations.backup.offsite_destination' => 'encrypted://offsite-vault/inventory',
            'operations.pilot.warehouse_code' => 'WH-PILOT',
            'operations.pilot.representative_code' => 'SR-PILOT',
            'operations.signoff_evidence_path' => $directory.'/signoff.json',
        ]);
        $this->app->detectEnvironment(fn () => 'production');

        try {
            $preflightExit = Artisan::call('inventory:readiness', [
                '--production' => true,
                '--stage' => 'preflight',
                '--json' => true,
            ]);
            $preflight = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame(0, $preflightExit, json_encode($preflight, JSON_PRETTY_PRINT));
            $this->assertSame('preflight', $preflight['stage']);
            $this->assertSame('ready', $preflight['status']);

            $evidence['release']['deployment_id'] = 'release-stale-000';
            File::put($directory.'/signoff.json', json_encode($evidence, JSON_THROW_ON_ERROR));
            $staleExit = Artisan::call('inventory:readiness', [
                '--production' => true,
                '--stage' => 'preflight',
                '--json' => true,
            ]);
            $stale = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame(1, $staleExit);
            $this->assertFalse(collect($stale['checks'])->firstWhere('name', 'rollout_signoff_evidence')['ok']);
            $evidence['release']['deployment_id'] = 'release-test-001';
            File::put($directory.'/signoff.json', json_encode($evidence, JSON_THROW_ON_ERROR));

            $evidence['uat']['approved_at'] = 'yesterday';
            File::put($directory.'/signoff.json', json_encode($evidence, JSON_THROW_ON_ERROR));
            $nonIsoExit = Artisan::call('inventory:readiness', [
                '--production' => true,
                '--stage' => 'preflight',
                '--json' => true,
            ]);
            $nonIso = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame(1, $nonIsoExit);
            $this->assertFalse(collect($nonIso['checks'])->firstWhere('name', 'rollout_signoff_evidence')['ok']);
            $evidence['uat']['approved_at'] = $approvedAt;
            File::put($directory.'/signoff.json', json_encode($evidence, JSON_THROW_ON_ERROR));

            $prematureFinalExit = Artisan::call('inventory:readiness', ['--production' => true, '--json' => true]);
            $prematureFinal = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame(1, $prematureFinalExit);
            $this->assertFalse(collect($prematureFinal['checks'])->firstWhere('name', 'rollout_signoff_evidence')['ok']);

            $evidence['post_launch'] = [
                'approved_by' => 'Named Owner',
                'approved_at' => $approvedAt,
                'evidence_reference' => 'record-post_launch',
            ];
            File::put($directory.'/signoff.json', json_encode($evidence, JSON_THROW_ON_ERROR));

            $exit = Artisan::call('inventory:readiness', ['--production' => true, '--json' => true]);
            $payload = json_decode(Artisan::output(), true, flags: JSON_THROW_ON_ERROR);

            $this->assertSame(0, $exit, json_encode($payload, JSON_PRETTY_PRINT));
            $this->assertSame('final', $payload['stage']);
            $this->assertSame('ready', $payload['status']);
            $this->assertSame(0, $payload['summary']['failed']);
            $this->assertTrue(collect($payload['checks'])->firstWhere('name', 'pilot_scope')['ok']);
            $this->assertTrue(collect($payload['checks'])->firstWhere('name', 'rollout_signoff_evidence')['ok']);
        } finally {
            File::deleteDirectory($directory);
        }
    }

    public function test_rollout_templates_are_complete_cross_referenced_and_non_mutating(): void
    {
        $result = app(MasterDataTemplateValidator::class)->validate(resource_path('import-templates'));

        $this->assertTrue($result['valid'], implode(PHP_EOL, $result['errors']));
        $this->assertSame([
            'warehouses.csv',
            'products.csv',
            'vehicles.csv',
            'customers.csv',
            'representatives.csv',
            'office-users.csv',
            'opening-stock.csv',
        ], array_keys($result['files']));
        $this->assertSame(0, Warehouse::query()->count());
    }

    public function test_rollout_validation_rejects_unknown_references_and_invalid_amounts(): void
    {
        $directory = storage_path('framework/testing/phase9-invalid-'.bin2hex(random_bytes(4)));
        File::copyDirectory(resource_path('import-templates'), $directory);
        File::put($directory.'/opening-stock.csv', "warehouse_code,sku,quantity,notes\nUNKNOWN,UNKNOWN,-2,Invalid\n");

        try {
            $result = app(MasterDataTemplateValidator::class)->validate($directory);
            $this->assertFalse($result['valid']);
            $errors = strtolower(implode(' ', $result['errors']));
            $this->assertStringContainsString('quantity field must be at least 1', $errors);
            $this->assertStringContainsString('unknown warehouse_code unknown', $errors);
            $this->assertStringContainsString('unknown sku unknown', $errors);
        } finally {
            File::deleteDirectory($directory);
        }
    }

    public function test_backup_and_production_readiness_are_scheduled_with_overlap_protection(): void
    {
        $events = collect(app(Schedule::class)->events());
        $backup = $events->first(fn ($event) => str_contains($event->command ?? '', 'inventory:backup'));
        $readiness = $events->first(fn ($event) => str_contains($event->command ?? '', 'inventory:readiness'));

        $this->assertNotNull($backup);
        $this->assertSame('30 1 * * *', $backup->expression);
        $this->assertTrue($backup->withoutOverlapping);
        $this->assertNotNull($readiness);
        $this->assertStringContainsString('--stage=preflight', $readiness->command);
        $this->assertSame('0 * * * *', $readiness->expression);
        $this->assertTrue($readiness->withoutOverlapping);
    }

    public function test_readiness_health_exposes_release_identity_without_secrets(): void
    {
        config()->set('operations.release.version', '1.0.0-rc1');
        config()->set('operations.release.deployment_id', 'release-20260817-a1b2c3');

        $this->getJson('/api/health')->assertOk()
            ->assertJsonPath('version', '1.0.0-rc1')
            ->assertJsonPath('deployment_id', 'release-20260817-a1b2c3')
            ->assertJsonMissingPath('database.password');
    }
}
