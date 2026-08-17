<?php

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\CustomerCreditTransaction;
use App\Models\IdempotencyKey;
use App\Models\Product;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeCashTransaction;
use App\Models\RepresentativeInventory;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
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
$engine = DB::selectOne("select engine from information_schema.tables where table_schema = database() and table_name = 'sales'")->engine ?? null;
if (strtoupper((string) $engine) !== 'INNODB') {
    throw new RuntimeException("sales must use InnoDB; found {$engine}.");
}

$token = strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
$directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'stockflow-phase5-'.strtolower($token);
mkdir($directory, 0700, true);
$created = [];

/** @return array{Process, Process} */
function overlapSales(int $firstId, int $secondId, int $firstUserId, int $secondUserId, string $mode, string $token, string $directory): array
{
    $ready = $directory.DIRECTORY_SEPARATOR.$mode.'-ready';
    $release = $directory.DIRECTORY_SEPARATOR.$mode.'-release';
    $helper = __DIR__.'/Support/post_sale.php';
    $first = new Process([PHP_BINARY, $helper, (string) $firstId, (string) $firstUserId, $mode.'-'.$token.'-1', $mode, $ready, $release], dirname(__DIR__));
    $first->setTimeout(15)->start();
    $deadline = microtime(true) + 5;
    while (! is_file($ready) && microtime(true) < $deadline) {
        usleep(20_000);
    }
    if (! is_file($ready)) {
        throw new RuntimeException("The first {$mode} sale did not acquire its contention lock.");
    }
    $second = new Process([PHP_BINARY, $helper, (string) $secondId, (string) $secondUserId, $mode.'-'.$token.'-2'], dirname(__DIR__));
    $second->setTimeout(15)->start();
    usleep(300_000);
    if (! $second->isRunning()) {
        throw new RuntimeException("The competing {$mode} sale did not wait on the held lock.");
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
        $warehouse = Warehouse::query()->create(['code' => "P5-{$token}", 'name' => 'Phase 5 warehouse', 'is_active' => true]);
        $stockProduct = Product::query()->create(['sku' => "P5S-{$token}", 'name' => 'Sale stock contention', 'unit' => 'piece', 'selling_price' => 100, 'is_active' => true]);
        $creditProductOne = Product::query()->create(['sku' => "P5C1-{$token}", 'name' => 'Credit contention one', 'unit' => 'piece', 'selling_price' => 600, 'is_active' => true]);
        $creditProductTwo = Product::query()->create(['sku' => "P5C2-{$token}", 'name' => 'Credit contention two', 'unit' => 'piece', 'selling_price' => 600, 'is_active' => true]);
        $customer = Customer::query()->create(['warehouse_id' => $warehouse->id, 'code' => "P5C-{$token}", 'name' => 'Phase 5 credit customer', 'credit_allowed' => true, 'credit_limit' => 1000, 'is_active' => true]);
        $stockCustomerOne = Customer::query()->create(['warehouse_id' => $warehouse->id, 'code' => "P5S1-{$token}", 'name' => 'Phase 5 stock customer one', 'credit_allowed' => false, 'credit_limit' => 0, 'is_active' => true]);
        $stockCustomerTwo = Customer::query()->create(['warehouse_id' => $warehouse->id, 'code' => "P5S2-{$token}", 'name' => 'Phase 5 stock customer two', 'credit_allowed' => false, 'credit_limit' => 0, 'is_active' => true]);
        $users = collect([1, 2])->map(fn (int $number) => User::query()->create(['name' => "Phase 5 representative {$number}", 'username' => strtolower("p5-{$token}-{$number}"), 'email' => strtolower("p5-{$token}-{$number}@test.local"), 'password' => 'not-used', 'is_active' => true]));
        $representatives = $users->map(fn (User $user, int $index) => SalesRepresentative::query()->create(['code' => "P5R-{$token}-".($index + 1), 'user_id' => $user->id, 'primary_warehouse_id' => $warehouse->id, 'name' => $user->name, 'is_active' => true]));
        RepresentativeInventory::query()->create(['sales_representative_id' => $representatives[0]->id, 'product_id' => $stockProduct->id, 'quantity' => 10]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representatives[0]->id, 'product_id' => $creditProductOne->id, 'quantity' => 2]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representatives[1]->id, 'product_id' => $creditProductTwo->id, 'quantity' => 2]);
        $makeSale = function (SalesRepresentative $representative, Customer $saleCustomer, Product $product, int $quantity, PaymentType $payment, string $suffix) use ($warehouse, $token): Sale {
            $sale = Sale::query()->create(['reference' => "P5-{$token}-{$suffix}", 'sales_representative_id' => $representative->id, 'warehouse_id' => $warehouse->id, 'customer_id' => $saleCustomer->id, 'payment_type' => $payment, 'total_amount' => $product->selling_price * $quantity, 'status' => SaleStatus::Draft, 'created_by' => $representative->user_id]);
            $sale->items()->create(['product_id' => $product->id, 'quantity' => $quantity, 'unit_price' => $product->selling_price, 'line_total' => $product->selling_price * $quantity]);

            return $sale;
        };
        $stockFirst = $makeSale($representatives[0], $stockCustomerOne, $stockProduct, 7, PaymentType::Cash, 'S1');
        $stockSecond = $makeSale($representatives[0], $stockCustomerTwo, $stockProduct, 7, PaymentType::Cash, 'S2');
        $creditFirst = $makeSale($representatives[0], $customer, $creditProductOne, 1, PaymentType::Credit, 'C1');
        $creditSecond = $makeSale($representatives[1], $customer, $creditProductTwo, 1, PaymentType::Credit, 'C2');

        return compact('warehouse', 'stockProduct', 'creditProductOne', 'creditProductTwo', 'customer', 'stockCustomerOne', 'stockCustomerTwo', 'users', 'representatives', 'stockFirst', 'stockSecond', 'creditFirst', 'creditSecond');
    });

    [$stockWinner, $stockRejected] = overlapSales($created['stockFirst']->id, $created['stockSecond']->id, $created['users'][0]->id, $created['users'][0]->id, 'stock', $token, $directory);
    $stockFinal = (int) RepresentativeInventory::query()->where('sales_representative_id', $created['representatives'][0]->id)->where('product_id', $created['stockProduct']->id)->value('quantity');
    if (! $stockWinner->isSuccessful() || $stockRejected->getExitCode() !== 2 || ! str_contains($stockRejected->getErrorOutput(), 'INSUFFICIENT_REPRESENTATIVE_STOCK') || $stockFinal !== 3) {
        throw new RuntimeException('Stock sale contention failed: '.$stockWinner->getErrorOutput().$stockRejected->getErrorOutput());
    }

    [$creditWinner, $creditRejected] = overlapSales($created['creditFirst']->id, $created['creditSecond']->id, $created['users'][0]->id, $created['users'][1]->id, 'credit', $token, $directory);
    $creditFinal = (int) CustomerCreditBalance::query()->where('customer_id', $created['customer']->id)->value('outstanding_amount');
    if (! $creditWinner->isSuccessful() || $creditRejected->getExitCode() !== 2 || ! str_contains($creditRejected->getErrorOutput(), 'CUSTOMER_CREDIT_LIMIT_EXCEEDED') || $creditFinal !== 600) {
        throw new RuntimeException('Credit sale contention failed: '.json_encode(['winner' => $creditWinner->getOutput().$creditWinner->getErrorOutput(), 'rejected' => $creditRejected->getOutput().$creditRejected->getErrorOutput(), 'outstanding' => $creditFinal]));
    }

    fwrite(STDOUT, json_encode(['database' => $version, 'engine' => $engine, 'stock_overlap' => ['starting' => 10, 'requests' => [7, 7], 'posted' => 1, 'rejected_code' => 'INSUFFICIENT_REPRESENTATIVE_STOCK', 'final' => $stockFinal], 'credit_overlap' => ['limit' => 1000, 'requests' => [600, 600], 'posted' => 1, 'rejected_code' => 'CUSTOMER_CREDIT_LIMIT_EXCEEDED', 'outstanding' => $creditFinal]], JSON_PRETTY_PRINT)."\n");
} finally {
    if ($created) {
        DB::transaction(function () use ($created): void {
            $saleIds = [$created['stockFirst']->id, $created['stockSecond']->id, $created['creditFirst']->id, $created['creditSecond']->id];
            $userIds = $created['users']->pluck('id');
            AuditLog::query()->whereIn('actor_id', $userIds)->delete();
            IdempotencyKey::query()->whereIn('user_id', $userIds)->delete();
            StockMovement::query()->where('source_type', 'sale')->whereIn('source_id', $saleIds)->delete();
            CustomerCreditTransaction::query()->where('source_type', 'sale')->whereIn('source_id', $saleIds)->delete();
            RepresentativeCashTransaction::query()->where('source_type', 'sale')->whereIn('source_id', $saleIds)->delete();
            RepresentativeCashBalance::query()->whereIn('sales_representative_id', $created['representatives']->pluck('id'))->delete();
            CustomerCreditBalance::query()->where('customer_id', $created['customer']->id)->delete();
            Sale::query()->whereIn('id', $saleIds)->each(fn (Sale $sale) => $sale->items()->delete());
            Sale::query()->whereIn('id', $saleIds)->delete();
            RepresentativeInventory::query()->whereIn('sales_representative_id', $created['representatives']->pluck('id'))->delete();
            $created['representatives']->each->delete();
            $created['customer']->delete();
            $created['stockCustomerOne']->delete();
            $created['stockCustomerTwo']->delete();
            $created['stockProduct']->delete();
            $created['creditProductOne']->delete();
            $created['creditProductTwo']->delete();
            $created['warehouse']->delete();
            $created['users']->each->delete();
        });
    }
    foreach (glob($directory.DIRECTORY_SEPARATOR.'*') ?: [] as $file) {
        @unlink($file);
    }
    @rmdir($directory);
}
