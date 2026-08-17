<?php

namespace Database\Seeders;

use App\Enums\CustomerPaymentStatus;
use App\Models\CashSubmission;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Services\CashSubmissionService;
use App\Services\CustomerPaymentPostingService;
use App\Services\DocumentReferenceGenerator;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SettlementSeeder extends Seeder
{
    public function run(): void
    {
        $representative = SalesRepresentative::query()->where('code', 'SR-001')->with('user')->firstOrFail();
        $customer = Customer::query()->where('code', 'CUS-ABC')->firstOrFail();
        $office = User::query()->where('username', 'superadmin')->firstOrFail();
        $cashService = app(CashSubmissionService::class);

        $confirmed = CashSubmission::query()->where('notes', 'Local demo confirmed cash handover.')->first();
        if (! $confirmed) {
            $result = $cashService->create($representative, 4000, 'Local demo confirmed cash handover.', $representative->user, 'local-demo-cash-submission-confirmed-create', $this->request($representative->user));
            $confirmed = CashSubmission::query()->findOrFail($result['id']);
        }
        if ($confirmed->status->value === 'pending') {
            $cashService->confirm($confirmed, $office, 'local-demo-cash-submission-confirm', $this->request($office));
        }

        if (! CashSubmission::query()->where('notes', 'Local demo pending cash handover.')->exists()) {
            $cashService->create($representative, 1000, 'Local demo pending cash handover.', $representative->user, 'local-demo-cash-submission-pending-create', $this->request($representative->user));
        }

        $payment = CustomerPayment::query()->where('notes', 'Local demo posted customer payment.')->first();
        if (! $payment) {
            $payment = DB::transaction(function () use ($customer, $office): CustomerPayment {
                return CustomerPayment::query()->create([
                    'reference' => app(DocumentReferenceGenerator::class)->next('customer_payment', 'PAY'),
                    'warehouse_id' => $customer->warehouse_id,
                    'customer_id' => $customer->id,
                    'amount' => 2000,
                    'payment_date' => now()->toDateString(),
                    'payment_method' => 'bank_transfer',
                    'payment_reference' => 'DEMO-BANK-001',
                    'notes' => 'Local demo posted customer payment.',
                    'status' => CustomerPaymentStatus::Draft,
                    'received_by' => $office->id,
                    'created_by' => $office->id,
                ]);
            });
        }
        if ($payment->status === CustomerPaymentStatus::Draft) {
            app(CustomerPaymentPostingService::class)->post($payment, $office, 'local-demo-customer-payment-post', $this->request($office));
        }

        if (! CustomerPayment::query()->where('notes', 'Local demo draft customer payment.')->exists()) {
            DB::transaction(function () use ($customer, $office): void {
                CustomerPayment::query()->create([
                    'reference' => app(DocumentReferenceGenerator::class)->next('customer_payment', 'PAY'),
                    'warehouse_id' => $customer->warehouse_id,
                    'customer_id' => $customer->id,
                    'amount' => 300,
                    'payment_date' => now()->toDateString(),
                    'payment_method' => 'cash',
                    'notes' => 'Local demo draft customer payment.',
                    'status' => CustomerPaymentStatus::Draft,
                    'received_by' => $office->id,
                    'created_by' => $office->id,
                ]);
            });
        }
    }

    private function request(User $actor): Request
    {
        $request = Request::create('/database/seed', 'POST', server: ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'SettlementSeeder']);
        $request->setUserResolver(fn () => $actor);

        return $request;
    }
}
