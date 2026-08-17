<?php

use App\Enums\SaleStatus;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDriverName() !== 'mysql') {
    throw new RuntimeException('Phase 7 reporting verification must run on MySQL/MariaDB.');
}

$posted = SaleStatus::Posted->value;
$sales = DB::table('sales')->where('status', $posted)->selectRaw('COUNT(*) documents, COALESCE(SUM(total_amount), 0) total')->first();
$lines = DB::table('sales')->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')->where('sales.status', $posted)
    ->selectRaw('COALESCE(SUM(sale_items.line_total), 0) total, COALESCE(SUM(sale_items.quantity), 0) units')->first();

if ((int) $sales->total !== (int) $lines->total) {
    throw new RuntimeException("Posted sales do not reconcile to their line totals: {$sales->total} != {$lines->total}.");
}

$requiredIndexes = [
    'sales' => ['sales_warehouse_status_posted_index', 'sales_rep_status_posted_index', 'sales_payment_status_posted_index'],
    'warehouse_transfers' => ['warehouse_transfer_source_status_date_index', 'warehouse_transfer_destination_status_date_index'],
    'representative_transfers' => ['representative_transfer_source_status_date_index', 'representative_transfer_rep_status_date_index'],
    'audit_logs' => ['audit_actor_date_index', 'audit_subject_date_index'],
];
$missingIndexes = [];
foreach ($requiredIndexes as $table => $names) {
    $present = collect(DB::select('SHOW INDEX FROM `'.$table.'`'))->pluck('Key_name')->unique();
    foreach ($names as $name) {
        if (! $present->contains($name)) {
            $missingIndexes[] = "{$table}.{$name}";
        }
    }
}
if ($missingIndexes !== []) {
    throw new RuntimeException('Missing Phase 7 reporting indexes: '.implode(', ', $missingIndexes));
}

$warehouseId = DB::table('warehouses')->min('id');
$representativeId = DB::table('sales_representatives')->min('id');
$warehousePlan = DB::selectOne('EXPLAIN SELECT SUM(total_amount) FROM sales FORCE INDEX (sales_warehouse_status_posted_index) WHERE warehouse_id = ? AND status = ? AND posted_at >= ? AND posted_at < ?', [$warehouseId, $posted, now()->startOfDay(), now()->addDay()->startOfDay()]);
$representativePlan = DB::selectOne('EXPLAIN SELECT SUM(total_amount) FROM sales FORCE INDEX (sales_rep_status_posted_index) WHERE sales_representative_id = ? AND status = ? AND posted_at >= ? AND posted_at < ?', [$representativeId, $posted, now()->startOfDay(), now()->addDay()->startOfDay()]);

foreach (['warehouse' => $warehousePlan, 'representative' => $representativePlan] as $scope => $plan) {
    if (($plan->key ?? null) === null || ! str_contains((string) ($plan->type ?? ''), 'range')) {
        throw new RuntimeException("The {$scope} dashboard aggregation does not have a range-index query plan: ".json_encode($plan));
    }
}

$result = [
    'database' => DB::selectOne('select version() as version')->version,
    'posted_documents' => (int) $sales->documents,
    'posted_sales_total' => (int) $sales->total,
    'posted_line_total' => (int) $lines->total,
    'posted_units' => (int) $lines->units,
    'reporting_indexes' => array_sum(array_map('count', $requiredIndexes)),
    'warehouse_plan' => ['type' => $warehousePlan->type, 'key' => $warehousePlan->key, 'rows' => (int) $warehousePlan->rows],
    'representative_plan' => ['type' => $representativePlan->type, 'key' => $representativePlan->key, 'rows' => (int) $representativePlan->rows],
];

fwrite(STDOUT, json_encode($result, JSON_PRETTY_PRINT)."\n");
