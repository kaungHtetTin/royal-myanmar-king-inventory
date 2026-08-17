<?php

namespace App\Console\Commands;

use App\Enums\RoleName;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\RolloutVerificationService;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Throwable;

class CheckProductionReadiness extends Command
{
    protected $signature = 'inventory:readiness
        {--production : Enforce every production-only environment and ownership requirement}
        {--stage=final : Production gate stage: preflight or final}
        {--warehouse= : Limit reconciliation to a pilot warehouse code}
        {--json : Emit machine-readable output}';

    protected $description = 'Fail the release when deployment, ownership, assignment, or balance checks are not ready';

    public function __construct(private readonly RolloutVerificationService $verification)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $production = (bool) $this->option('production');
        $stage = strtolower(trim((string) $this->option('stage')));
        if (! in_array($stage, ['preflight', 'final'], true)) {
            return $this->finish([['name' => 'readiness_stage', 'ok' => false, 'detail' => 'Stage must be preflight or final.']], stage: $stage);
        }
        $warehouse = $this->pilotWarehouse();
        if ($this->option('warehouse') && ! $warehouse) {
            return $this->finish([['name' => 'pilot_warehouse', 'ok' => false, 'detail' => 'The requested pilot warehouse was not found and active.']], stage: $production ? $stage : 'local');
        }

        try {
            $checks = [
                $this->check('database', fn () => DB::selectOne('select 1') !== null, 'Database connection responds.'),
                $this->check('migrations', fn () => $this->pendingMigrations() === [], 'No migration file is pending.'),
                $this->check('storage', fn () => is_writable(storage_path()) && is_writable(storage_path('framework')) && is_writable(storage_path('logs')), 'Runtime storage paths are writable.'),
                $this->check('master_data', fn () => Warehouse::query()->where('is_active', true)->exists() && Product::query()->where('is_active', true)->exists() && Customer::query()->where('is_active', true)->exists(), 'Active warehouse, product, and customer records exist.'),
                $this->check('super_admin', fn () => User::query()->where('is_active', true)->role(RoleName::SuperAdmin->value)->exists(), 'An active Super Admin exists.'),
                $this->check('office_assignments', fn () => ! User::query()->where('is_active', true)->role(RoleName::OfficeAdmin->value)->whereDoesntHave('warehouses')->exists(), 'Every active Office Admin has a warehouse assignment.'),
                $this->check('representative_assignments', fn () => $this->representativeAssignmentFailures() === 0, 'Every active representative has an active login, role, primary warehouse, and matching warehouse assignment.'),
                $this->check('transaction_engine', fn () => $this->tablesUseTransactionalEngine(), 'MySQL/MariaDB tables use InnoDB.'),
            ];

            foreach ($this->verification->verify($warehouse) as $name => $result) {
                $checks[] = [
                    'name' => 'reconcile_'.$name,
                    'ok' => $result['ok'],
                    'detail' => "{$result['records']} records checked; {$result['mismatches']} mismatches.",
                ];
            }

            if ($production) {
                $checks = [...$checks, ...$this->productionChecks($stage)];
            }
        } catch (Throwable $exception) {
            $checks[] = ['name' => 'readiness_execution', 'ok' => false, 'detail' => $exception->getMessage()];
        }

        return $this->finish($checks, $warehouse, $production ? $stage : 'local');
    }

    private function pilotWarehouse(): ?Warehouse
    {
        $code = trim((string) ($this->option('warehouse') ?: config('operations.pilot.warehouse_code')));

        return $code === '' ? null : Warehouse::query()->where('code', strtoupper($code))->where('is_active', true)->first();
    }

    /** @return array{name: string, ok: bool, detail: string} */
    private function check(string $name, callable $callback, string $success): array
    {
        $ok = (bool) $callback();

        return ['name' => $name, 'ok' => $ok, 'detail' => $ok ? $success : 'Requirement is not satisfied.'];
    }

    /** @return list<string> */
    private function pendingMigrations(): array
    {
        $files = collect(File::files(database_path('migrations')))->map(fn ($file) => $file->getFilenameWithoutExtension());
        $ran = DB::table('migrations')->pluck('migration');

        return $files->diff($ran)->values()->all();
    }

    private function representativeAssignmentFailures(): int
    {
        return SalesRepresentative::query()->where('is_active', true)->with(['user.roles', 'user.warehouses'])->get()
            ->filter(fn (SalesRepresentative $representative) => ! $representative->user
                || ! $representative->user->is_active
                || ! $representative->user->hasRole(RoleName::SalesRepresentative->value)
                || ! $representative->user->warehouses->contains('id', $representative->primary_warehouse_id))
            ->count();
    }

    private function tablesUseTransactionalEngine(): bool
    {
        if (DB::getDriverName() !== 'mysql') {
            return true;
        }

        return DB::table('information_schema.tables')
            ->where('table_schema', DB::getDatabaseName())
            ->whereNotNull('engine')
            ->where('engine', '!=', 'InnoDB')
            ->doesntExist();
    }

    /** @return list<array{name: string, ok: bool, detail: string}> */
    private function productionChecks(string $stage): array
    {
        $contacts = config('operations.contacts', []);
        $release = config('operations.release', []);
        $origins = config('cors.allowed_origins', []);
        $backup = $this->latestBackup();
        $pilotWarehouse = trim((string) config('operations.pilot.warehouse_code'));
        $pilotRepresentative = trim((string) config('operations.pilot.representative_code'));

        return [
            $this->check('production_environment', fn () => app()->environment('production') && ! config('app.debug'), 'Production mode is active and debug is disabled.'),
            $this->check('application_key', fn () => filled(config('app.key')), 'The application encryption key is configured.'),
            $this->check('https_url', fn () => str_starts_with((string) config('app.url'), 'https://'), 'The canonical application URL uses HTTPS.'),
            $this->check('secure_session', fn () => config('session.secure') === true && config('session.http_only') === true && config('session.encrypt') === true, 'Session cookies are secure/HTTP-only and session payloads are encrypted.'),
            $this->check('structured_logging', fn () => in_array('structured', config('logging.channels.stack.channels', []), true) && config('logging.default') === 'stack', 'Structured logging is included in the default stack.'),
            $this->check('cors_origins', fn () => $origins !== [] && collect($origins)->every(fn ($origin) => str_starts_with($origin, 'https://') && ! str_contains($origin, '*')), 'Credentialed CORS origins are explicit HTTPS origins.'),
            $this->check('database_credentials', fn () => filled(config('database.connections.mysql.password')) && config('database.connections.mysql.username') !== 'root', 'Production uses a non-root database account with a configured secret.'),
            $this->check('release_identity', fn () => $this->configured($release['version'] ?? null) && $this->configured($release['deployment_id'] ?? null), 'Version and deployment ID are configured.'),
            $this->check('operations_contacts', fn () => collect($contacts)->every(fn ($value) => $this->configured($value)), 'Business, technical, security, incident, and recovery owners are configured.'),
            $this->check('backup_directory', fn () => $this->safeBackupDirectory(), 'The backup directory is absolute and outside the public web root.'),
            $this->check('backup_destination', fn () => $this->configured(config('operations.backup.offsite_destination')), 'An encrypted off-host backup destination is configured.'),
            $this->check('backup_freshness', fn () => $backup && $backup['age_hours'] <= config('operations.backup.maximum_age_hours'), $backup ? "Latest backup is {$backup['age_hours']} hours old." : 'No usable backup was found.'),
            $this->check('pilot_scope', fn () => $this->validPilotScope($pilotWarehouse, $pilotRepresentative), 'The active pilot representative is assigned to the active pilot warehouse.'),
            $this->check('rollout_signoff_evidence', fn () => $this->validSignoffEvidence($pilotWarehouse, $pilotRepresentative, $stage), $stage === 'preflight'
                ? 'UAT, opening-balance, restore, and pilot sign-off evidence is complete.'
                : 'UAT, opening-balance, restore, pilot, and post-launch sign-off evidence is complete.'),
        ];
    }

    private function configured(mixed $value): bool
    {
        return is_string($value) && trim($value) !== '' && ! str_contains($value, '<') && ! str_contains(strtolower($value), 'tbd');
    }

    private function safeBackupDirectory(): bool
    {
        $directory = trim((string) config('operations.backup.directory'));
        if (! $this->configured($directory) || preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/)/', $directory) !== 1) {
            return false;
        }

        $directory = strtolower(rtrim(str_replace('\\', '/', $directory), '/'));
        $public = strtolower(rtrim(str_replace('\\', '/', realpath(public_path()) ?: public_path()), '/'));

        return $directory !== $public && ! str_starts_with($directory.'/', $public.'/');
    }

    /** @return array{path: string, age_hours: int}|null */
    private function latestBackup(): ?array
    {
        $files = glob(rtrim((string) config('operations.backup.directory'), '\\/').DIRECTORY_SEPARATOR.'*.sql') ?: [];
        $files = array_values(array_filter($files, fn ($path) => is_file($path) && filesize($path) > 0));
        if ($files === []) {
            return null;
        }
        usort($files, fn ($left, $right) => filemtime($right) <=> filemtime($left));

        return ['path' => $files[0], 'age_hours' => (int) floor((time() - filemtime($files[0])) / 3600)];
    }

    private function validSignoffEvidence(string $pilotWarehouse, string $pilotRepresentative, string $stage): bool
    {
        $path = (string) config('operations.signoff_evidence_path');
        if (! is_file($path) || ! is_readable($path)) {
            return false;
        }
        $evidence = json_decode((string) file_get_contents($path), true);
        if (! is_array($evidence)) {
            return false;
        }
        if (($evidence['release']['version'] ?? null) !== config('operations.release.version')
            || ($evidence['release']['deployment_id'] ?? null) !== config('operations.release.deployment_id')) {
            return false;
        }
        $sections = ['uat', 'opening_balances', 'restore', 'pilot'];
        if ($stage === 'final') {
            $sections[] = 'post_launch';
        }
        foreach ($sections as $section) {
            if (! isset($evidence[$section]) || ! is_array($evidence[$section])) {
                return false;
            }
            foreach (['approved_by', 'approved_at', 'evidence_reference'] as $field) {
                if (! $this->configured($evidence[$section][$field] ?? null)) {
                    return false;
                }
            }
            if (! $this->validApprovalTimestamp($evidence[$section]['approved_at'])) {
                return false;
            }
        }

        return ($evidence['pilot']['warehouse_code'] ?? null) === $pilotWarehouse
            && ($evidence['pilot']['representative_code'] ?? null) === $pilotRepresentative;
    }

    private function validPilotScope(string $warehouseCode, string $representativeCode): bool
    {
        if (! $this->configured($warehouseCode) || ! $this->configured($representativeCode)) {
            return false;
        }

        return SalesRepresentative::query()
            ->where('code', strtoupper($representativeCode))
            ->where('is_active', true)
            ->whereHas('primaryWarehouse', fn ($query) => $query
                ->where('code', strtoupper($warehouseCode))
                ->where('is_active', true))
            ->whereHas('user', fn ($query) => $query
                ->where('is_active', true)
                ->role(RoleName::SalesRepresentative->value))
            ->exists();
    }

    private function validApprovalTimestamp(string $timestamp): bool
    {
        if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/', $timestamp) !== 1) {
            return false;
        }

        try {
            $approvedAt = CarbonImmutable::parse($timestamp);

            return $approvedAt->lessThanOrEqualTo(now()->addMinute());
        } catch (Throwable) {
            return false;
        }
    }

    /** @param list<array{name: string, ok: bool, detail: string}> $checks */
    private function finish(array $checks, ?Warehouse $warehouse = null, string $stage = 'local'): int
    {
        $passed = collect($checks)->where('ok', true)->count();
        $payload = [
            'status' => $passed === count($checks) ? 'ready' : 'not_ready',
            'mode' => $this->option('production') ? 'production' : 'local',
            'stage' => $stage,
            'pilot_warehouse' => $warehouse?->code,
            'checked_at' => now()->toISOString(),
            'summary' => ['passed' => $passed, 'failed' => count($checks) - $passed],
            'checks' => $checks,
        ];

        if ($this->option('json')) {
            $this->line(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $this->table(['Check', 'Result', 'Detail'], collect($checks)->map(fn ($check) => [$check['name'], $check['ok'] ? 'PASS' : 'FAIL', $check['detail']])->all());
            $this->newLine();
            $this->line($payload['status'] === 'ready' ? '<info>Release readiness checks passed.</info>' : '<error>Release readiness checks failed.</error>');
        }

        return $payload['status'] === 'ready' ? self::SUCCESS : self::FAILURE;
    }
}
