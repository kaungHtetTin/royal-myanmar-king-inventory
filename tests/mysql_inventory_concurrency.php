<?php

use App\Enums\AdjustmentType;
use App\Enums\InventoryDocumentStatus;
use App\Models\AuditLog;
use App\Models\IdempotencyKey;
use App\Models\Product;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDriverName() !== 'mysql') {
    fwrite(STDERR, "This verification must run on the MySQL connection.\n");
    exit(1);
}

$databaseVersion = DB::selectOne('select version() as version')->version;
$engine = DB::selectOne("select engine from information_schema.tables where table_schema = database() and table_name = 'warehouse_inventories'")->engine ?? null;
if (strtoupper((string) $engine) !== 'INNODB') {
    fwrite(STDERR, "warehouse_inventories must use InnoDB; found {$engine}.\n");
    exit(1);
}

$token = strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
$temporaryDirectory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'stockflow-concurrency-'.strtolower($token);
mkdir($temporaryDirectory, 0700, true);
$readyFile = $temporaryDirectory.DIRECTORY_SEPARATOR.'ready';
$releaseFile = $temporaryDirectory.DIRECTORY_SEPARATOR.'release';
$user = $warehouse = $product = null;

try {
    [$user, $warehouse, $product, $first, $second] = DB::transaction(function () use ($token): array {
        $user = User::query()->create(['name' => 'Concurrency verifier', 'username' => "concurrency-{$token}", 'email' => strtolower($token).'@test.local', 'password' => 'not-used', 'is_active' => true]);
        $warehouse = Warehouse::query()->create(['code' => "CC-{$token}", 'name' => 'Concurrency test warehouse', 'is_active' => true]);
        $product = Product::query()->create(['sku' => "CC-{$token}", 'name' => 'Concurrency test product', 'unit' => 'piece', 'selling_price' => 0, 'is_active' => true]);
        WarehouseInventory::query()->create(['warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'quantity' => 50]);
        $attributes = ['warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'adjustment_type' => AdjustmentType::Decrease, 'quantity' => 40, 'reason' => 'Concurrent deduction verification.', 'status' => InventoryDocumentStatus::Draft, 'created_by' => $user->id];
        $first = StockAdjustment::query()->create($attributes + ['reference' => "CCA-{$token}-1"]);
        $second = StockAdjustment::query()->create($attributes + ['reference' => "CCA-{$token}-2"]);

        return [$user, $warehouse, $product, $first, $second];
    });

    $php = PHP_BINARY;
    $helper = __DIR__.DIRECTORY_SEPARATOR.'Support'.DIRECTORY_SEPARATOR.'post_inventory_adjustment.php';
    $firstProcess = new Process([$php, $helper, (string) $first->id, (string) $user->id, "concurrency-{$token}-1", $readyFile, $releaseFile], dirname(__DIR__));
    $firstProcess->setTimeout(15)->start();
    $deadline = microtime(true) + 5;
    while (! is_file($readyFile) && microtime(true) < $deadline) {
        usleep(20_000);
    }
    if (! is_file($readyFile)) {
        throw new RuntimeException('The first process did not acquire its row lock.');
    }

    $secondProcess = new Process([$php, $helper, (string) $second->id, (string) $user->id, "concurrency-{$token}-2"], dirname(__DIR__));
    $secondProcess->setTimeout(15)->start();
    usleep(300_000);
    if (! $secondProcess->isRunning()) {
        throw new RuntimeException('The competing deduction did not wait on the held row lock.');
    }
    file_put_contents($releaseFile, 'release');
    $firstProcess->wait();
    $secondProcess->wait();

    $quantity = WarehouseInventory::query()->where('warehouse_id', $warehouse->id)->where('product_id', $product->id)->value('quantity');
    $posted = StockAdjustment::query()->whereIn('id', [$first->id, $second->id])->where('status', InventoryDocumentStatus::Posted)->count();
    $draft = StockAdjustment::query()->whereIn('id', [$first->id, $second->id])->where('status', InventoryDocumentStatus::Draft)->count();
    $movements = StockMovement::query()->whereIn('source_id', [$first->id, $second->id])->where('source_type', 'stock_adjustment')->count();
    if (! $firstProcess->isSuccessful() || $secondProcess->getExitCode() !== 2 || ! str_contains($secondProcess->getErrorOutput(), 'INSUFFICIENT_WAREHOUSE_STOCK') || $quantity !== 10 || $posted !== 1 || $draft !== 1 || $movements !== 1) {
        throw new RuntimeException(json_encode(['first' => $firstProcess->getOutput().$firstProcess->getErrorOutput(), 'second' => $secondProcess->getOutput().$secondProcess->getErrorOutput(), 'quantity' => $quantity, 'posted' => $posted, 'draft' => $draft, 'movements' => $movements], JSON_PRETTY_PRINT));
    }

    fwrite(STDOUT, json_encode(['database' => $databaseVersion, 'engine' => $engine, 'overlap_proven' => true, 'starting_quantity' => 50, 'competing_deductions' => [40, 40], 'posted_documents' => $posted, 'rejected_code' => 'INSUFFICIENT_WAREHOUSE_STOCK', 'final_quantity' => $quantity, 'movements' => $movements], JSON_PRETTY_PRINT)."\n");
} finally {
    if ($user && $warehouse && $product) {
        DB::transaction(function () use ($user, $warehouse, $product): void {
            $adjustmentIds = StockAdjustment::query()->where('created_by', $user->id)->pluck('id');
            AuditLog::query()->where('actor_id', $user->id)->delete();
            IdempotencyKey::query()->where('user_id', $user->id)->delete();
            StockMovement::query()->where('created_by', $user->id)->delete();
            StockAdjustment::query()->whereIn('id', $adjustmentIds)->delete();
            WarehouseInventory::query()->where('warehouse_id', $warehouse->id)->where('product_id', $product->id)->delete();
            $product->delete();
            $warehouse->delete();
            $user->delete();
        });
    }
    @unlink($readyFile);
    @unlink($releaseFile);
    @rmdir($temporaryDirectory);
}
