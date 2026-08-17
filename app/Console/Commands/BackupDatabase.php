<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

class BackupDatabase extends Command
{
    protected $signature = 'inventory:backup {--path= : Absolute or storage-relative destination path}';

    protected $description = 'Create a transaction-consistent MySQL/MariaDB database backup';

    public function handle(): int
    {
        $connection = config('database.default');
        $database = config("database.connections.{$connection}");
        if (($database['driver'] ?? null) !== 'mysql') {
            $this->error('The inventory backup command requires a MySQL/MariaDB connection.');

            return self::FAILURE;
        }

        $path = $this->destinationPath();
        File::ensureDirectoryExists(dirname($path), 0700);
        $binary = $this->binary('MYSQLDUMP_BINARY', 'mysqldump');
        $arguments = [
            $binary,
            '--single-transaction',
            '--quick',
            '--skip-lock-tables',
            '--default-character-set=utf8mb4',
            '--host='.(string) ($database['host'] ?? '127.0.0.1'),
            '--port='.(string) ($database['port'] ?? 3306),
            '--user='.(string) ($database['username'] ?? ''),
            '--result-file='.$path,
            (string) $database['database'],
        ];

        $process = new Process($arguments, base_path(), ['MYSQL_PWD' => (string) ($database['password'] ?? '')]);
        $process->setTimeout(300)->run();
        if (! $process->isSuccessful() || ! is_file($path) || filesize($path) === 0) {
            if (is_file($path)) {
                unlink($path);
            }
            $this->error('Database backup failed. '.$process->getErrorOutput());

            return self::FAILURE;
        }

        @chmod($path, 0600);
        $pruned = $this->pruneExpiredBackups();
        $this->info('Database backup created: '.$path);
        if ($pruned > 0) {
            $this->info("Removed {$pruned} backup(s) older than the configured retention period.");
        }

        return self::SUCCESS;
    }

    private function destinationPath(): string
    {
        $requested = trim((string) $this->option('path'));
        $directory = rtrim((string) config('operations.backup.directory'), '\\/');
        if ($requested === '') {
            return $directory.DIRECTORY_SEPARATOR.'inventory-'.now()->format('Ymd-His').'.sql';
        }

        $isAbsolute = preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/)/', $requested) === 1;

        return $isAbsolute ? $requested : $directory.DIRECTORY_SEPARATOR.$requested;
    }

    private function binary(string $environmentKey, string $fallback): string
    {
        $configured = env($environmentKey);
        if (is_string($configured) && $configured !== '') {
            return $configured;
        }

        $xampp = realpath(dirname(PHP_BINARY).'/../mysql/bin/'.$fallback.'.exe');

        return $xampp ?: $fallback;
    }

    private function pruneExpiredBackups(): int
    {
        $directory = realpath((string) config('operations.backup.directory'));
        $defaultDirectory = realpath(storage_path('app/private/backups'));
        $retentionDays = (int) config('operations.backup.retention_days');
        if (! $directory || ! $defaultDirectory || $directory !== $defaultDirectory || $retentionDays < 1) {
            return 0;
        }

        $cutoff = now()->subDays($retentionDays)->getTimestamp();
        $pruned = 0;
        foreach (File::glob($directory.DIRECTORY_SEPARATOR.'inventory-*.sql') as $backup) {
            if (is_file($backup) && filemtime($backup) < $cutoff && File::delete($backup)) {
                $pruned++;
            }
        }

        return $pruned;
    }
}
