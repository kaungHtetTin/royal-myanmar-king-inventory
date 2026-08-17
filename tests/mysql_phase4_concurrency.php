<?php

use App\Enums\TransferStatus;
use App\Models\AuditLog;
use App\Models\IdempotencyKey;
use App\Models\InTransitInventory;
use App\Models\Product;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Models\WarehouseTransfer;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (DB::connection()->getDriverName() !== 'mysql') {
    fwrite(STDERR, "This verification must run on MySQL/MariaDB.\n");
    exit(1);
}
$version = DB::selectOne('select version() as version')->version;
$engine = DB::selectOne("select engine from information_schema.tables where table_schema = database() and table_name = 'representative_inventories'")->engine ?? null;
if (strtoupper((string) $engine) !== 'INNODB') {
    throw new RuntimeException("representative_inventories must use InnoDB; found {$engine}.");
}

$token = strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
$directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'stockflow-phase4-'.strtolower($token);
mkdir($directory, 0700, true);
$created = [];

/** @return array{Process, Process} */
function overlap(string $helper, int $firstId, int $secondId, int $userId, string $keyPrefix, string $directory): array
{
    $ready = $directory.DIRECTORY_SEPARATOR.$keyPrefix.'-ready';
    $release = $directory.DIRECTORY_SEPARATOR.$keyPrefix.'-release';
    $first = new Process([PHP_BINARY, $helper, (string) $firstId, (string) $userId, $keyPrefix.'-1', $ready, $release], dirname(__DIR__));
    $first->setTimeout(15)->start();
    $deadline = microtime(true) + 5;
    while (! is_file($ready) && microtime(true) < $deadline) {
        usleep(20_000);
    }
    if (! is_file($ready)) {
        throw new RuntimeException('The first process did not acquire its reservation lock.');
    }
    $second = new Process([PHP_BINARY, $helper, (string) $secondId, (string) $userId, $keyPrefix.'-2'], dirname(__DIR__));
    $second->setTimeout(15)->start();
    usleep(300_000);
    if (! $second->isRunning()) {
        throw new RuntimeException('The competing process did not wait on the held row lock.');
    }
    file_put_contents($release, 'release');
    $first->wait();
    $second->wait();
    @unlink($ready);
    @unlink($release);

    return [$first, $second];
}

try {
    $created = DB::transaction(function () use ($token): array {
        $actor = User::query()->create(['name' => 'Phase 4 verifier', 'username' => "phase4-{$token}", 'email' => strtolower($token).'@test.local', 'password' => 'not-used', 'is_active' => true]);
        $representativeUser = User::query()->create(['name' => 'Phase 4 representative', 'username' => "phase4-rep-{$token}", 'email' => 'rep-'.strtolower($token).'@test.local', 'password' => 'not-used', 'is_active' => true]);
        $source = Warehouse::query()->create(['code' => "P4S-{$token}", 'name' => 'Phase 4 source', 'is_active' => true]);
        $destination = Warehouse::query()->create(['code' => "P4D-{$token}", 'name' => 'Phase 4 destination', 'is_active' => true]);
        $warehouseProduct = Product::query()->create(['sku' => "P4W-{$token}", 'name' => 'Warehouse contention product', 'unit' => 'piece', 'selling_price' => 0, 'is_active' => true]);
        $representativeProduct = Product::query()->create(['sku' => "P4R-{$token}", 'name' => 'Representative contention product', 'unit' => 'piece', 'selling_price' => 0, 'is_active' => true]);
        $representative = SalesRepresentative::query()->create(['code' => "P4R-{$token}", 'user_id' => $representativeUser->id, 'primary_warehouse_id' => $source->id, 'name' => 'Phase 4 representative', 'is_active' => true]);
        WarehouseInventory::query()->create(['warehouse_id' => $source->id, 'product_id' => $warehouseProduct->id, 'quantity' => 50]);
        WarehouseInventory::query()->create(['warehouse_id' => $source->id, 'product_id' => $representativeProduct->id, 'quantity' => 200]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $representativeProduct->id, 'quantity' => 60]);
        $warehouseAttributes = ['source_warehouse_id' => $source->id, 'destination_warehouse_id' => $destination->id, 'status' => TransferStatus::Draft, 'created_by' => $actor->id];
        $warehouseFirst = WarehouseTransfer::query()->create($warehouseAttributes + ['reference' => "P4W-{$token}-1"]);
        $warehouseFirst->items()->create(['product_id' => $warehouseProduct->id, 'quantity' => 40]);
        $warehouseSecond = WarehouseTransfer::query()->create($warehouseAttributes + ['reference' => "P4W-{$token}-2"]);
        $warehouseSecond->items()->create(['product_id' => $warehouseProduct->id, 'quantity' => 30]);
        $representativeAttributes = ['source_warehouse_id' => $source->id, 'sales_representative_id' => $representative->id, 'status' => TransferStatus::Draft, 'created_by' => $actor->id];
        $representativeFirst = RepresentativeTransfer::query()->create($representativeAttributes + ['reference' => "P4R-{$token}-1"]);
        $representativeFirst->items()->create(['product_id' => $representativeProduct->id, 'quantity' => 25]);
        $representativeSecond = RepresentativeTransfer::query()->create($representativeAttributes + ['reference' => "P4R-{$token}-2"]);
        $representativeSecond->items()->create(['product_id' => $representativeProduct->id, 'quantity' => 25]);

        return compact('actor', 'representativeUser', 'source', 'destination', 'warehouseProduct', 'representativeProduct', 'representative', 'warehouseFirst', 'warehouseSecond', 'representativeFirst', 'representativeSecond');
    });

    [$warehouseWinner, $warehouseRejected] = overlap(__DIR__.'/Support/dispatch_warehouse_transfer.php', $created['warehouseFirst']->id, $created['warehouseSecond']->id, $created['actor']->id, 'warehouse-'.$token, $directory);
    $warehouseQuantity = WarehouseInventory::query()->where('warehouse_id', $created['source']->id)->where('product_id', $created['warehouseProduct']->id)->value('quantity');
    if (! $warehouseWinner->isSuccessful() || $warehouseRejected->getExitCode() !== 2 || ! str_contains($warehouseRejected->getErrorOutput(), 'INSUFFICIENT_WAREHOUSE_STOCK') || $warehouseQuantity !== 10) {
        throw new RuntimeException('Warehouse contention failed: '.$warehouseWinner->getErrorOutput().$warehouseRejected->getErrorOutput());
    }

    [$representativeWinner, $representativeRejected] = overlap(__DIR__.'/Support/dispatch_representative_transfer.php', $created['representativeFirst']->id, $created['representativeSecond']->id, $created['actor']->id, 'representative-'.$token, $directory);
    $pending = InTransitInventory::query()->where('transfer_type', 'representative_transfer')->whereIn('transfer_id', [$created['representativeFirst']->id, $created['representativeSecond']->id])->sum('quantity');
    $current = RepresentativeInventory::query()->where('sales_representative_id', $created['representative']->id)->where('product_id', $created['representativeProduct']->id)->value('quantity');
    if (! $representativeWinner->isSuccessful() || $representativeRejected->getExitCode() !== 2 || ! str_contains($representativeRejected->getErrorOutput(), 'REPRESENTATIVE_STOCK_LIMIT_EXCEEDED') || (int) $current !== 60 || (int) $pending !== 25) {
        throw new RuntimeException('Representative contention failed: '.json_encode(['winner_exit' => $representativeWinner->getExitCode(), 'winner' => $representativeWinner->getOutput().$representativeWinner->getErrorOutput(), 'rejected_exit' => $representativeRejected->getExitCode(), 'rejected' => $representativeRejected->getOutput().$representativeRejected->getErrorOutput(), 'current' => $current, 'pending' => $pending]));
    }

    fwrite(STDOUT, json_encode(['database' => $version, 'engine' => $engine, 'warehouse_overlap' => ['starting' => 50, 'requests' => [40, 30], 'posted' => 1, 'rejected_code' => 'INSUFFICIENT_WAREHOUSE_STOCK', 'final' => $warehouseQuantity], 'representative_overlap' => ['current' => 60, 'requests' => [25, 25], 'posted' => 1, 'rejected_code' => 'REPRESENTATIVE_STOCK_LIMIT_EXCEEDED', 'pending' => (int) $pending, 'projected_total' => $current + (int) $pending]], JSON_PRETTY_PRINT)."\n");
} finally {
    if ($created) {
        DB::transaction(function () use ($created): void {
            $actorIds = [$created['actor']->id, $created['representativeUser']->id];
            AuditLog::query()->whereIn('actor_id', $actorIds)->delete();
            IdempotencyKey::query()->whereIn('user_id', $actorIds)->delete();
            StockMovement::query()->whereIn('created_by', $actorIds)->delete();
            InTransitInventory::query()->whereIn('transfer_id', [$created['warehouseFirst']->id, $created['warehouseSecond']->id])->where('transfer_type', 'warehouse_transfer')->delete();
            InTransitInventory::query()->whereIn('transfer_id', [$created['representativeFirst']->id, $created['representativeSecond']->id])->where('transfer_type', 'representative_transfer')->delete();
            $created['warehouseFirst']->items()->delete();
            $created['warehouseSecond']->items()->delete();
            $created['representativeFirst']->items()->delete();
            $created['representativeSecond']->items()->delete();
            WarehouseTransfer::query()->whereIn('id', [$created['warehouseFirst']->id, $created['warehouseSecond']->id])->delete();
            RepresentativeTransfer::query()->whereIn('id', [$created['representativeFirst']->id, $created['representativeSecond']->id])->delete();
            RepresentativeInventory::query()->where('sales_representative_id', $created['representative']->id)->delete();
            WarehouseInventory::query()->where('warehouse_id', $created['source']->id)->whereIn('product_id', [$created['warehouseProduct']->id, $created['representativeProduct']->id])->delete();
            $created['representative']->delete();
            $created['warehouseProduct']->delete();
            $created['representativeProduct']->delete();
            $created['source']->delete();
            $created['destination']->delete();
            $created['actor']->delete();
            $created['representativeUser']->delete();
        });
    }
    foreach (glob($directory.DIRECTORY_SEPARATOR.'*') ?: [] as $file) {
        @unlink($file);
    }
    @rmdir($directory);
}
