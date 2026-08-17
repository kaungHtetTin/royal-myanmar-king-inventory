<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDriverName() !== 'mysql') {
    throw new RuntimeException('Phase 8 backup/restore verification must run on MySQL/MariaDB.');
}

$connectionName = config('database.default');
$source = config("database.connections.{$connectionName}");
$verificationDatabase = 'inventory_restore_verify_'.bin2hex(random_bytes(5));
if (! preg_match('/^inventory_restore_verify_[a-f0-9]{10}$/', $verificationDatabase)) {
    throw new RuntimeException('Unsafe restore verification database name.');
}

$backupPath = storage_path('app/private/backups/phase8-restore-verification.sql');
$mysqlBinary = env('MYSQL_BINARY');
if (! is_string($mysqlBinary) || $mysqlBinary === '') {
    $xamppBinary = realpath(dirname(PHP_BINARY).'/../mysql/bin/mysql.exe');
    $mysqlBinary = $xamppBinary ?: 'mysql';
}
$environment = ['MYSQL_PWD' => (string) ($source['password'] ?? '')];
$serverArguments = [
    '--host='.(string) ($source['host'] ?? '127.0.0.1'),
    '--port='.(string) ($source['port'] ?? 3306),
    '--user='.(string) ($source['username'] ?? ''),
];

$expected = [
    'migrations' => DB::table('migrations')->count(),
    'users' => DB::table('users')->count(),
    'warehouses' => DB::table('warehouses')->count(),
    'products' => DB::table('products')->count(),
    'posted_sales' => (int) DB::table('sales')->where('status', 'posted')->sum('total_amount'),
];

try {
    if (Artisan::call('inventory:backup', ['--path' => $backupPath]) !== 0) {
        throw new RuntimeException('Backup command failed: '.Artisan::output());
    }

    DB::statement("CREATE DATABASE `{$verificationDatabase}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $restore = new Process(array_merge([$mysqlBinary], $serverArguments, [$verificationDatabase]), base_path(), $environment);
    $restore->setInput(file_get_contents($backupPath));
    $restore->setTimeout(300)->run();
    if (! $restore->isSuccessful()) {
        throw new RuntimeException('Restore process failed: '.$restore->getErrorOutput());
    }

    config(['database.connections.phase8_restore' => array_merge($source, ['database' => $verificationDatabase])]);
    DB::purge('phase8_restore');
    $restored = [
        'migrations' => DB::connection('phase8_restore')->table('migrations')->count(),
        'users' => DB::connection('phase8_restore')->table('users')->count(),
        'warehouses' => DB::connection('phase8_restore')->table('warehouses')->count(),
        'products' => DB::connection('phase8_restore')->table('products')->count(),
        'posted_sales' => (int) DB::connection('phase8_restore')->table('sales')->where('status', 'posted')->sum('total_amount'),
    ];
    if ($restored !== $expected) {
        throw new RuntimeException('Restored database does not match the source baseline: '.json_encode(compact('expected', 'restored')));
    }

    fwrite(STDOUT, json_encode([
        'database' => DB::selectOne('select version() as version')->version,
        'backup_bytes' => filesize($backupPath),
        'restored' => $restored,
        'usable' => true,
    ], JSON_PRETTY_PRINT)."\n");
} finally {
    DB::disconnect('phase8_restore');
    DB::statement("DROP DATABASE IF EXISTS `{$verificationDatabase}`");
    if (is_file($backupPath)) {
        unlink($backupPath);
    }
}
