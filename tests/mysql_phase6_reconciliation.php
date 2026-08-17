<?php

use App\Enums\CashSubmissionStatus;
use App\Enums\FinancialTransactionType;
use App\Models\CashSubmission;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\CustomerCreditTransaction;
use App\Models\CustomerPayment;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeCashTransaction;
use App\Models\SalesRepresentative;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (DB::connection()->getDriverName() !== 'mysql') {
    throw new RuntimeException('Phase 6 reconciliation must run on MySQL/MariaDB.');
}

$cashMismatch = RepresentativeCashBalance::query()->get()->filter(fn (RepresentativeCashBalance $balance) => $balance->amount !== (int) RepresentativeCashTransaction::query()->where('sales_representative_id', $balance->sales_representative_id)->sum('amount_delta'));
$creditMismatch = CustomerCreditBalance::query()->get()->filter(fn (CustomerCreditBalance $balance) => $balance->outstanding_amount !== (int) CustomerCreditTransaction::query()->where('customer_id', $balance->customer_id)->sum('amount_delta'));
$unlinkedCashReversals = RepresentativeCashTransaction::query()->whereIn('transaction_type', [FinancialTransactionType::CashSaleVoid, FinancialTransactionType::CashSubmissionReversed])->whereNull('reversal_of_id')->count();
$unlinkedCreditReversals = CustomerCreditTransaction::query()->whereIn('transaction_type', [FinancialTransactionType::CreditSaleVoid, FinancialTransactionType::CustomerPaymentVoid])->whereNull('reversal_of_id')->count();
$pendingWithLedger = CashSubmission::query()->where('status', CashSubmissionStatus::Pending)->whereExists(fn ($query) => $query->selectRaw('1')->from('representative_cash_transactions')->whereColumn('representative_cash_transactions.source_id', 'cash_submissions.id')->where('representative_cash_transactions.source_type', 'cash_submission'))->count();

if ($cashMismatch->isNotEmpty() || $creditMismatch->isNotEmpty() || $unlinkedCashReversals || $unlinkedCreditReversals || $pendingWithLedger) {
    throw new RuntimeException('Phase 6 reconciliation failed: '.json_encode(compact('cashMismatch', 'creditMismatch', 'unlinkedCashReversals', 'unlinkedCreditReversals', 'pendingWithLedger')));
}

$representative = SalesRepresentative::query()->where('code', 'SR-001')->firstOrFail();
$customer = Customer::query()->where('code', 'CUS-ABC')->firstOrFail();
$result = [
    'database' => DB::selectOne('select version() as version')->version,
    'cash_balances_reconciled' => RepresentativeCashBalance::query()->count(),
    'credit_balances_reconciled' => CustomerCreditBalance::query()->count(),
    'unlinked_reversals' => 0,
    'pending_submissions_with_ledger_effect' => 0,
    'seed' => [
        'representative_cash_hold' => (int) RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount'),
        'pending_cash' => (int) CashSubmission::query()->where('sales_representative_id', $representative->id)->where('status', CashSubmissionStatus::Pending)->sum('amount'),
        'customer_outstanding' => (int) CustomerCreditBalance::query()->where('customer_id', $customer->id)->value('outstanding_amount'),
        'cash_submissions' => CashSubmission::query()->where('notes', 'like', 'Local demo%cash handover.')->count(),
        'customer_payments' => CustomerPayment::query()->where('notes', 'like', 'Local demo%customer payment.')->count(),
    ],
];

if ($result['seed'] !== ['representative_cash_hold' => 1400, 'pending_cash' => 1000, 'customer_outstanding' => 700, 'cash_submissions' => 2, 'customer_payments' => 2]) {
    throw new RuntimeException('The idempotent Phase 6 seed baseline is unexpected: '.json_encode($result['seed']));
}

fwrite(STDOUT, json_encode($result, JSON_PRETTY_PRINT)."\n");
