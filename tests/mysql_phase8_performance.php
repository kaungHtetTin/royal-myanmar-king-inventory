<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDriverName() !== 'mysql') {
    throw new RuntimeException('Phase 8 performance verification must run on MySQL/MariaDB.');
}

$required = [
    'products' => ['products_active_name_index'],
    'customers' => ['customers_warehouse_name_index'],
    'sales_representatives' => ['representatives_warehouse_name_index'],
    'stock_movements' => ['stock_movements_product_date_index', 'stock_movements_from_date_index', 'stock_movements_to_date_index'],
    'sales' => ['sales_customer_status_posted_index'],
    'cash_submissions' => ['cash_submission_scope_status_date_index'],
    'customer_payments' => ['customer_payment_scope_status_date_index'],
    'audit_logs' => ['audit_event_date_index'],
];

foreach ($required as $table => $indexes) {
    $present = collect(DB::select('SHOW INDEX FROM `'.$table.'`'))->pluck('Key_name')->unique();
    foreach ($indexes as $index) {
        if (! $present->contains($index)) {
            throw new RuntimeException("Missing Phase 8 index {$table}.{$index}.");
        }
    }
}

$warehouseId = DB::table('warehouses')->min('id');
$representativeId = DB::table('sales_representatives')->min('id');
$queries = [
    'customer_page' => fn () => DB::table('customers')->where('warehouse_id', $warehouseId)->orderBy('name')->limit(20)->get(),
    'representative_page' => fn () => DB::table('sales_representatives')->where('primary_warehouse_id', $warehouseId)->orderBy('name')->limit(20)->get(),
    'movement_history' => fn () => DB::table('stock_movements')->where('from_location_type', 'representative')->where('from_location_id', $representativeId)->latest('occurred_at')->limit(25)->get(),
    'posted_sales_summary' => fn () => DB::table('sales')->where('warehouse_id', $warehouseId)->where('status', 'posted')->whereBetween('posted_at', [now()->subYear(), now()])->sum('total_amount'),
];
$timings = [];
foreach ($queries as $name => $query) {
    $samples = [];
    foreach (range(1, 50) as $_) {
        $started = hrtime(true);
        $query();
        $samples[] = (hrtime(true) - $started) / 1_000_000;
    }
    sort($samples);
    $p95 = $samples[(int) floor(count($samples) * 0.95) - 1];
    if ($p95 > 250) {
        throw new RuntimeException("{$name} exceeded the 250 ms p95 database budget: {$p95} ms.");
    }
    $timings[$name] = round($p95, 2);
}

fwrite(STDOUT, json_encode([
    'database' => DB::selectOne('select version() as version')->version,
    'verified_indexes' => array_sum(array_map('count', $required)),
    'iterations_per_query' => 50,
    'p95_ms' => $timings,
], JSON_PRETTY_PRINT)."\n");
