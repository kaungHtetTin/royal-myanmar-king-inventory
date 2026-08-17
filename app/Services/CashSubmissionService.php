<?php

namespace App\Services;

use App\Enums\CashSubmissionStatus;
use App\Enums\FinancialTransactionType;
use App\Exceptions\DomainConflictException;
use App\Models\CashSubmission;
use App\Models\RepresentativeCashTransaction;
use App\Models\SalesRepresentative;
use App\Models\User;
use Illuminate\Http\Request;

class CashSubmissionService
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly DocumentReferenceGenerator $references,
        private readonly RepresentativeCashMutation $cash,
        private readonly AuditLogger $auditLogger,
    ) {}

    /** @return array<string, mixed> */
    public function create(SalesRepresentative $representative, int $amount, ?string $notes, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, 'cash-submission:create', $key, function () use ($representative, $amount, $notes, $actor, $request): array {
            $representative = SalesRepresentative::query()->lockForUpdate()->findOrFail($representative->id);
            if (! $representative->is_active || $representative->user_id !== $actor->id) {
                throw new DomainConflictException('Only an active linked representative can submit cash.', 'INVALID_REPRESENTATIVE');
            }
            $balance = $this->cash->lock($representative->id);
            $pending = (int) CashSubmission::query()->where('sales_representative_id', $representative->id)->where('status', CashSubmissionStatus::Pending)->lockForUpdate()->get(['amount'])->sum('amount');
            if ($pending + $amount > $balance->amount) {
                throw new DomainConflictException('Cash submission exceeds the unsubmitted cash hold.', 'INSUFFICIENT_REPRESENTATIVE_CASH', ['cash_hold' => $balance->amount, 'pending' => $pending, 'requested' => $amount, 'available_to_submit' => max(0, $balance->amount - $pending)]);
            }
            $submission = CashSubmission::query()->create(['reference' => $this->references->next('cash_submission', 'CSB'), 'sales_representative_id' => $representative->id, 'warehouse_id' => $representative->primary_warehouse_id, 'amount' => $amount, 'status' => CashSubmissionStatus::Pending, 'notes' => $notes, 'created_by' => $actor->id]);
            $this->auditLogger->record($request, 'cash_submission.created', $actor, $submission, $this->metadata($submission));

            return ['id' => $submission->id, 'reference' => $submission->reference, 'status' => CashSubmissionStatus::Pending->value, 'amount' => $amount];
        });
    }

    /** @return array<string, mixed> */
    public function confirm(CashSubmission $submission, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "cash-submission:{$submission->id}:confirm", $key, function () use ($submission, $actor, $request): array {
            $submission = $this->locked($submission);
            $this->requireStatus($submission, CashSubmissionStatus::Pending);
            $balance = $this->cash->lock($submission->sales_representative_id);
            $this->cash->decrease($balance, $submission->amount);
            $occurredAt = now();
            RepresentativeCashTransaction::query()->create(['sales_representative_id' => $submission->sales_representative_id, 'transaction_type' => FinancialTransactionType::CashSubmissionConfirmed, 'amount_delta' => -$submission->amount, 'source_type' => 'cash_submission', 'source_id' => $submission->id, 'reference' => $submission->reference, 'created_by' => $actor->id, 'notes' => $submission->notes, 'occurred_at' => $occurredAt]);
            $submission->update(['status' => CashSubmissionStatus::Confirmed, 'confirmed_by' => $actor->id, 'confirmed_at' => $occurredAt]);
            $this->auditLogger->record($request, 'cash_submission.confirmed', $actor, $submission, $this->metadata($submission));

            return $this->result($submission, CashSubmissionStatus::Confirmed);
        });
    }

    /** @return array<string, mixed> */
    public function cancel(CashSubmission $submission, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "cash-submission:{$submission->id}:cancel", $key, function () use ($submission, $actor, $reason, $request): array {
            $submission = $this->locked($submission);
            $this->requireStatus($submission, CashSubmissionStatus::Pending);
            $submission->update(['status' => CashSubmissionStatus::Cancelled, 'cancelled_by' => $actor->id, 'cancelled_at' => now(), 'cancel_reason' => $reason]);
            $this->auditLogger->record($request, 'cash_submission.cancelled', $actor, $submission, $this->metadata($submission) + ['reason' => $reason]);

            return $this->result($submission, CashSubmissionStatus::Cancelled);
        });
    }

    /** @return array<string, mixed> */
    public function reverse(CashSubmission $submission, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "cash-submission:{$submission->id}:reverse", $key, function () use ($submission, $actor, $reason, $request): array {
            $submission = $this->locked($submission);
            $this->requireStatus($submission, CashSubmissionStatus::Confirmed);
            $balance = $this->cash->lock($submission->sales_representative_id);
            $original = RepresentativeCashTransaction::query()->where('source_type', 'cash_submission')->where('source_id', $submission->id)->where('transaction_type', FinancialTransactionType::CashSubmissionConfirmed)->lockForUpdate()->firstOrFail();
            $this->cash->increase($balance, $submission->amount);
            $occurredAt = now();
            RepresentativeCashTransaction::query()->create(['sales_representative_id' => $submission->sales_representative_id, 'transaction_type' => FinancialTransactionType::CashSubmissionReversed, 'amount_delta' => $submission->amount, 'source_type' => 'cash_submission', 'source_id' => $submission->id, 'reversal_of_id' => $original->id, 'reference' => $submission->reference, 'created_by' => $actor->id, 'notes' => $reason, 'occurred_at' => $occurredAt]);
            $submission->update(['status' => CashSubmissionStatus::Reversed, 'reversed_by' => $actor->id, 'reversed_at' => $occurredAt, 'reversal_reason' => $reason]);
            $this->auditLogger->record($request, 'cash_submission.reversed', $actor, $submission, $this->metadata($submission) + ['reason' => $reason]);

            return $this->result($submission, CashSubmissionStatus::Reversed);
        });
    }

    private function locked(CashSubmission $submission): CashSubmission
    {
        return CashSubmission::query()->with(['representative', 'warehouse', 'creator', 'confirmer', 'canceller', 'reverser'])->lockForUpdate()->findOrFail($submission->id);
    }

    private function requireStatus(CashSubmission $submission, CashSubmissionStatus $status): void
    {
        if ($submission->status !== $status) {
            throw new DomainConflictException("Only {$status->value} cash submissions support this command.", 'INVALID_DOCUMENT_STATE', ['current_status' => $submission->status->value]);
        }
    }

    /** @return array<string, mixed> */
    private function metadata(CashSubmission $submission): array
    {
        return ['reference' => $submission->reference, 'sales_representative_id' => $submission->sales_representative_id, 'warehouse_id' => $submission->warehouse_id, 'amount' => $submission->amount];
    }

    /** @return array<string, mixed> */
    private function result(CashSubmission $submission, CashSubmissionStatus $status): array
    {
        return ['id' => $submission->id, 'reference' => $submission->reference, 'status' => $status->value, 'amount' => $submission->amount];
    }
}
