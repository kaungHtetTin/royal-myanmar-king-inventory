<?php

namespace App\Services;

use App\Enums\CustomerPaymentStatus;
use App\Enums\FinancialTransactionType;
use App\Exceptions\DomainConflictException;
use App\Models\Customer;
use App\Models\CustomerCreditTransaction;
use App\Models\CustomerPayment;
use App\Models\RepresentativeCashTransaction;
use App\Models\User;
use Illuminate\Http\Request;

class CustomerPaymentPostingService
{
    public function __construct(private readonly IdempotencyService $idempotency, private readonly CustomerCreditMutation $credit, private readonly RepresentativeCashMutation $cash, private readonly AuditLogger $auditLogger, private readonly PaymentMethodRegistry $paymentMethods) {}

    /** @return array<string, mixed> */
    public function post(CustomerPayment $payment, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "customer-payment:{$payment->id}:post", $key, function () use ($payment, $actor, $request): array {
            $payment = $this->locked($payment);
            $this->requireStatus($payment, CustomerPaymentStatus::Draft);
            $customer = Customer::query()->lockForUpdate()->findOrFail($payment->customer_id);
            if ($customer->warehouse_id !== $payment->warehouse_id) {
                throw new DomainConflictException('Customer payment warehouse no longer matches the customer.', 'INVALID_CUSTOMER_SCOPE');
            }
            $balance = $this->credit->lock($customer);
            $cashBalance = $payment->sales_representative_id && $this->paymentMethods->addsToCashHold($payment->payment_method) ? $this->cash->lock($payment->sales_representative_id) : null;
            $this->credit->decrease($balance, $payment->amount);
            $occurredAt = now();
            CustomerCreditTransaction::query()->create(['customer_id' => $payment->customer_id, 'transaction_type' => FinancialTransactionType::CustomerPayment, 'amount_delta' => -$payment->amount, 'source_type' => 'customer_payment', 'source_id' => $payment->id, 'reference' => $payment->reference, 'created_by' => $actor->id, 'notes' => $payment->notes, 'occurred_at' => $occurredAt]);
            if ($cashBalance) {
                $this->cash->increase($cashBalance, $payment->amount);
                RepresentativeCashTransaction::query()->create(['sales_representative_id' => $payment->sales_representative_id, 'transaction_type' => FinancialTransactionType::CustomerPayment, 'amount_delta' => $payment->amount, 'source_type' => 'customer_payment', 'source_id' => $payment->id, 'reference' => $payment->reference, 'created_by' => $actor->id, 'notes' => $payment->notes, 'occurred_at' => $occurredAt]);
            }
            $payment->update(['status' => CustomerPaymentStatus::Posted, 'posted_by' => $actor->id, 'posted_at' => $occurredAt]);
            $this->auditLogger->record($request, 'customer_payment.posted', $actor, $payment, $this->metadata($payment));

            return $this->result($payment, CustomerPaymentStatus::Posted);
        });
    }

    /** @return array<string, mixed> */
    public function void(CustomerPayment $payment, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "customer-payment:{$payment->id}:void", $key, function () use ($payment, $actor, $reason, $request): array {
            $payment = $this->locked($payment);
            $this->requireStatus($payment, CustomerPaymentStatus::Posted);
            $customer = Customer::query()->lockForUpdate()->findOrFail($payment->customer_id);
            $balance = $this->credit->lock($customer);
            $cashBalance = $payment->sales_representative_id && $this->paymentMethods->addsToCashHold($payment->payment_method) ? $this->cash->lock($payment->sales_representative_id) : null;
            $original = CustomerCreditTransaction::query()->where('source_type', 'customer_payment')->where('source_id', $payment->id)->where('transaction_type', FinancialTransactionType::CustomerPayment)->lockForUpdate()->firstOrFail();
            $this->credit->increase($balance, $payment->amount);
            $occurredAt = now();
            CustomerCreditTransaction::query()->create(['customer_id' => $payment->customer_id, 'transaction_type' => FinancialTransactionType::CustomerPaymentVoid, 'amount_delta' => $payment->amount, 'source_type' => 'customer_payment', 'source_id' => $payment->id, 'reversal_of_id' => $original->id, 'reference' => $payment->reference, 'created_by' => $actor->id, 'notes' => $reason, 'occurred_at' => $occurredAt]);
            if ($cashBalance) {
                $this->cash->decrease($cashBalance, $payment->amount);
                $originalCash = RepresentativeCashTransaction::query()->where('source_type', 'customer_payment')->where('source_id', $payment->id)->where('transaction_type', FinancialTransactionType::CustomerPayment)->lockForUpdate()->firstOrFail();
                RepresentativeCashTransaction::query()->create(['sales_representative_id' => $payment->sales_representative_id, 'transaction_type' => FinancialTransactionType::CustomerPaymentVoid, 'amount_delta' => -$payment->amount, 'source_type' => 'customer_payment', 'source_id' => $payment->id, 'reversal_of_id' => $originalCash->id, 'reference' => $payment->reference, 'created_by' => $actor->id, 'notes' => $reason, 'occurred_at' => $occurredAt]);
            }
            $payment->update(['status' => CustomerPaymentStatus::Voided, 'voided_by' => $actor->id, 'voided_at' => $occurredAt, 'void_reason' => $reason]);
            $this->auditLogger->record($request, 'customer_payment.voided', $actor, $payment, $this->metadata($payment) + ['reason' => $reason]);

            return $this->result($payment, CustomerPaymentStatus::Voided);
        });
    }

    private function locked(CustomerPayment $payment): CustomerPayment
    {
        return CustomerPayment::query()->with(['trip', 'representative', 'warehouse', 'customer', 'receiver', 'creator', 'poster', 'voider'])->lockForUpdate()->findOrFail($payment->id);
    }

    private function requireStatus(CustomerPayment $payment, CustomerPaymentStatus $status): void
    {
        if ($payment->status !== $status) {
            throw new DomainConflictException("Only {$status->value} customer payments support this command.", 'INVALID_DOCUMENT_STATE', ['current_status' => $payment->status->value]);
        }
    }

    /** @return array<string, mixed> */
    private function metadata(CustomerPayment $payment): array
    {
        return ['reference' => $payment->reference, 'customer_id' => $payment->customer_id, 'warehouse_id' => $payment->warehouse_id, 'amount' => $payment->amount, 'payment_date' => $payment->payment_date->toDateString(), 'payment_method' => $payment->payment_method, 'payment_reference' => $payment->payment_reference, 'received_by' => $payment->received_by];
    }

    /** @return array<string, mixed> */
    private function result(CustomerPayment $payment, CustomerPaymentStatus $status): array
    {
        return ['id' => $payment->id, 'reference' => $payment->reference, 'status' => $status->value, 'amount' => $payment->amount];
    }
}
