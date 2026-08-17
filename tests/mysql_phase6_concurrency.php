<?php

use App\Enums\CashSubmissionStatus;
use App\Enums\CustomerPaymentStatus;
use App\Enums\FinancialTransactionType;
use App\Models\AuditLog;
use App\Models\CashSubmission;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\CustomerCreditTransaction;
use App\Models\CustomerPayment;
use App\Models\IdempotencyKey;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeCashTransaction;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (DB::connection()->getDriverName() !== 'mysql') {
    throw new RuntimeException('Phase 6 concurrency verification requires MySQL/MariaDB.');
}
$version = DB::selectOne('select version() as version')->version;
$token = strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
$directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'stockflow-phase6-'.strtolower($token);
mkdir($directory, 0700, true);
$created = [];

/** @return array{Process, Process} */
function overlapSettlement(string $helper, int $firstId, int $secondId, int $userId, string $mode, string $token, string $directory): array
{
    $ready = $directory.DIRECTORY_SEPARATOR.$mode.'-ready';
    $release = $directory.DIRECTORY_SEPARATOR.$mode.'-release';
    $first = new Process([PHP_BINARY, __DIR__.'/Support/'.$helper, (string) $firstId, (string) $userId, $mode.'-'.$token.'-1', $ready, $release], dirname(__DIR__));
    $first->setTimeout(15)->start();
    $deadline = microtime(true) + 5;
    while (! is_file($ready) && microtime(true) < $deadline) {
        usleep(20_000);
    }
    if (! is_file($ready)) {
        throw new RuntimeException("The first {$mode} command did not acquire its balance lock.");
    }
    $second = new Process([PHP_BINARY, __DIR__.'/Support/'.$helper, (string) $secondId, (string) $userId, $mode.'-'.$token.'-2'], dirname(__DIR__));
    $second->setTimeout(15)->start();
    usleep(300_000);
    if (! $second->isRunning()) {
        throw new RuntimeException("The competing {$mode} command did not wait on the held lock.");
    }
    file_put_contents($release, 'release');
    $first->wait();
    $second->wait();

    return [$first, $second];
}

try {
    $created = DB::transaction(function () use ($token): array {
        $warehouse = Warehouse::query()->create(['code' => "P6-{$token}", 'name' => 'Phase 6 settlement warehouse', 'is_active' => true]);
        $user = User::query()->create(['name' => 'Phase 6 office actor', 'username' => strtolower("p6-{$token}"), 'email' => strtolower("p6-{$token}@test.local"), 'password' => 'not-used', 'is_active' => true]);
        $repUser = User::query()->create(['name' => 'Phase 6 representative', 'username' => strtolower("p6r-{$token}"), 'email' => strtolower("p6r-{$token}@test.local"), 'password' => 'not-used', 'is_active' => true]);
        $representative = SalesRepresentative::query()->create(['code' => "P6R-{$token}", 'user_id' => $repUser->id, 'primary_warehouse_id' => $warehouse->id, 'name' => 'Phase 6 representative', 'is_active' => true]);
        RepresentativeCashBalance::query()->create(['sales_representative_id' => $representative->id, 'amount' => 1000]);
        RepresentativeCashTransaction::query()->create(['sales_representative_id' => $representative->id, 'transaction_type' => FinancialTransactionType::CashSale, 'amount_delta' => 1000, 'source_type' => 'phase6_test', 'source_id' => $representative->id, 'reference' => "P6-{$token}-CASH", 'created_by' => $user->id, 'occurred_at' => now()]);
        $submissions = collect([1, 2])->map(fn (int $number) => CashSubmission::query()->create(['reference' => "P6-{$token}-CS{$number}", 'sales_representative_id' => $representative->id, 'warehouse_id' => $warehouse->id, 'amount' => 700, 'status' => CashSubmissionStatus::Pending, 'created_by' => $repUser->id]));
        $customer = Customer::query()->create(['warehouse_id' => $warehouse->id, 'code' => "P6C-{$token}", 'name' => 'Phase 6 customer', 'credit_allowed' => true, 'credit_limit' => 2000, 'is_active' => true]);
        CustomerCreditBalance::query()->create(['customer_id' => $customer->id, 'outstanding_amount' => 1000]);
        CustomerCreditTransaction::query()->create(['customer_id' => $customer->id, 'transaction_type' => FinancialTransactionType::CreditSale, 'amount_delta' => 1000, 'source_type' => 'phase6_test', 'source_id' => $customer->id, 'reference' => "P6-{$token}-CREDIT", 'created_by' => $user->id, 'occurred_at' => now()]);
        $payments = collect([1, 2])->map(fn (int $number) => CustomerPayment::query()->create(['reference' => "P6-{$token}-PAY{$number}", 'warehouse_id' => $warehouse->id, 'customer_id' => $customer->id, 'amount' => 700, 'payment_date' => now()->toDateString(), 'payment_method' => 'cash', 'status' => CustomerPaymentStatus::Draft, 'received_by' => $user->id, 'created_by' => $user->id]));

        return compact('warehouse', 'user', 'repUser', 'representative', 'submissions', 'customer', 'payments');
    });
    [$cashWinner, $cashRejected] = overlapSettlement('confirm_cash_submission.php', $created['submissions'][0]->id, $created['submissions'][1]->id, $created['user']->id, 'cash', $token, $directory);
    $cashFinal = (int) RepresentativeCashBalance::query()->where('sales_representative_id', $created['representative']->id)->value('amount');
    if (! $cashWinner->isSuccessful() || $cashRejected->getExitCode() !== 2 || ! str_contains($cashRejected->getErrorOutput(), 'INSUFFICIENT_REPRESENTATIVE_CASH') || $cashFinal !== 300) {
        throw new RuntimeException('Cash confirmation contention failed. '.$cashWinner->getErrorOutput().$cashRejected->getErrorOutput());
    }
    [$paymentWinner, $paymentRejected] = overlapSettlement('post_customer_payment.php', $created['payments'][0]->id, $created['payments'][1]->id, $created['user']->id, 'payment', $token, $directory);
    $creditFinal = (int) CustomerCreditBalance::query()->where('customer_id', $created['customer']->id)->value('outstanding_amount');
    if (! $paymentWinner->isSuccessful() || $paymentRejected->getExitCode() !== 2 || ! str_contains($paymentRejected->getErrorOutput(), 'INSUFFICIENT_CUSTOMER_CREDIT') || $creditFinal !== 300) {
        throw new RuntimeException('Customer payment contention failed. '.$paymentWinner->getErrorOutput().$paymentRejected->getErrorOutput());
    }
    fwrite(STDOUT, json_encode(['database' => $version, 'cash_confirmation_overlap' => ['starting' => 1000, 'requests' => [700, 700], 'confirmed' => 1, 'rejected_code' => 'INSUFFICIENT_REPRESENTATIVE_CASH', 'final' => $cashFinal], 'customer_payment_overlap' => ['starting' => 1000, 'requests' => [700, 700], 'posted' => 1, 'rejected_code' => 'INSUFFICIENT_CUSTOMER_CREDIT', 'final' => $creditFinal]], JSON_PRETTY_PRINT)."\n");
} finally {
    if ($created) {
        DB::transaction(function () use ($created): void {
            $submissionIds = $created['submissions']->pluck('id');
            $paymentIds = $created['payments']->pluck('id');
            $userIds = collect([$created['user']->id, $created['repUser']->id]);
            AuditLog::query()->whereIn('actor_id', $userIds)->delete();
            IdempotencyKey::query()->whereIn('user_id', $userIds)->delete();
            RepresentativeCashTransaction::query()->where('source_type', 'cash_submission')->whereIn('source_id', $submissionIds)->delete();
            CustomerCreditTransaction::query()->where('source_type', 'customer_payment')->whereIn('source_id', $paymentIds)->delete();
            CashSubmission::query()->whereIn('id', $submissionIds)->delete();
            CustomerPayment::query()->whereIn('id', $paymentIds)->delete();
            RepresentativeCashTransaction::query()->where('source_type', 'phase6_test')->delete();
            CustomerCreditTransaction::query()->where('source_type', 'phase6_test')->delete();
            RepresentativeCashBalance::query()->where('sales_representative_id', $created['representative']->id)->delete();
            CustomerCreditBalance::query()->where('customer_id', $created['customer']->id)->delete();
            $created['representative']->delete();
            $created['customer']->delete();
            $created['warehouse']->delete();
            $created['repUser']->delete();
            $created['user']->delete();
        });
    }
    foreach (glob($directory.DIRECTORY_SEPARATOR.'*') ?: [] as $file) {
        @unlink($file);
    } @rmdir($directory);
}
