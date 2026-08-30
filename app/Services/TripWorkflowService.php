<?php

namespace App\Services;

use App\Enums\CashSubmissionStatus;
use App\Enums\SaleStatus;
use App\Enums\TransferStatus;
use App\Enums\TripStatus;
use App\Exceptions\DomainConflictException;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\Trip;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TripWorkflowService
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly RepresentativeTransferPostingService $transferPosting,
    ) {}

    public function start(Trip $trip, User $actor, Request $request): Trip
    {
        return DB::transaction(function () use ($trip, $actor, $request): Trip {
            $trip = Trip::query()->lockForUpdate()->findOrFail($trip->id);
            $this->requireStatus($trip, TripStatus::Planning);
            $dispatchedIssues = $trip->transfers()
                ->where('direction', 'issue')
                ->where('status', TransferStatus::Dispatched)
                ->lockForUpdate()
                ->get();
            foreach ($dispatchedIssues as $issue) {
                $this->transferPosting->receive(
                    $issue,
                    $actor,
                    "trip-start-auto-receive-{$trip->id}-{$issue->id}",
                    $request,
                );
            }
            $receivedIssues = $trip->transfers()->where('direction', 'issue')->where('status', TransferStatus::Received)->count();
            if ($receivedIssues < 1) {
                throw new DomainConflictException('Dispatch at least one stock issue before starting operation.', 'TRIP_STOCK_NOT_DISPATCHED');
            }
            $trip->update(['status' => TripStatus::Operation, 'started_by' => $actor->id, 'started_at' => now()]);
            $this->auditLogger->record($request, 'trip.operation_started', $actor, $trip, $this->metadata($trip));

            return $trip;
        });
    }

    public function beginEnding(Trip $trip, User $actor, Request $request): Trip
    {
        return DB::transaction(function () use ($trip, $actor, $request): Trip {
            $trip = Trip::query()->lockForUpdate()->findOrFail($trip->id);
            $this->requireStatus($trip, TripStatus::Operation);
            if ($trip->sales()->where('status', SaleStatus::Draft)->exists()) {
                throw new DomainConflictException('Post or remove every draft sale before ending the trip.', 'TRIP_HAS_DRAFT_SALES');
            }
            $trip->update(['status' => TripStatus::Ending, 'ending_by' => $actor->id, 'ending_at' => now()]);
            $this->auditLogger->record($request, 'trip.ending_started', $actor, $trip, $this->metadata($trip));

            return $trip;
        });
    }

    public function complete(Trip $trip, User $actor, ?string $notes, Request $request): Trip
    {
        return DB::transaction(function () use ($trip, $actor, $notes, $request): Trip {
            $trip = Trip::query()->lockForUpdate()->findOrFail($trip->id);
            $this->requireStatus($trip, TripStatus::Ending);
            if ($trip->transfers()->whereIn('status', [TransferStatus::Draft, TransferStatus::Dispatched])->exists()) {
                throw new DomainConflictException('Complete or cancel every open stock document first.', 'TRIP_HAS_OPEN_STOCK_DOCUMENTS');
            }
            if ($trip->cashSubmissions()->where('status', CashSubmissionStatus::Pending)->exists()) {
                throw new DomainConflictException('Office confirmation is required for pending cash submissions.', 'TRIP_HAS_PENDING_CASH');
            }

            $stock = (int) RepresentativeInventory::query()
                ->where('sales_representative_id', $trip->sales_representative_id)
                ->get(['quantity', 'foc_quantity'])->sum(fn ($row) => $row->quantity + $row->foc_quantity);
            $cash = (int) RepresentativeCashBalance::query()
                ->where('sales_representative_id', $trip->sales_representative_id)->value('amount');
            if ($stock !== 0 || $cash !== 0) {
                throw new DomainConflictException(
                    'Return all stock and confirm all cash handovers before completing the trip.',
                    'TRIP_HAS_REMAINING_BALANCES',
                    ['stock_units' => $stock, 'cash_amount' => $cash],
                );
            }

            $trip->update([
                'status' => TripStatus::Completed,
                'completed_by' => $actor->id,
                'completed_at' => now(),
                'completion_notes' => $notes,
                'stock_variance_units' => $stock,
                'cash_variance_amount' => $cash,
            ]);
            $this->auditLogger->record($request, 'trip.completed', $actor, $trip, $this->metadata($trip));

            return $trip;
        });
    }

    public function cancel(Trip $trip, User $actor, string $reason, Request $request): Trip
    {
        return DB::transaction(function () use ($trip, $actor, $reason, $request): Trip {
            $trip = Trip::query()->lockForUpdate()->findOrFail($trip->id);
            $this->requireStatus($trip, TripStatus::Planning);
            if ($trip->transfers()->whereIn('status', [TransferStatus::Dispatched, TransferStatus::Received])->exists()) {
                throw new DomainConflictException('A trip with issued stock cannot be cancelled. Return the stock through ending.', 'TRIP_HAS_ISSUED_STOCK');
            }
            $trip->update(['status' => TripStatus::Cancelled, 'cancelled_by' => $actor->id, 'cancelled_at' => now(), 'cancel_reason' => $reason]);
            $this->auditLogger->record($request, 'trip.cancelled', $actor, $trip, $this->metadata($trip) + ['reason' => $reason]);

            return $trip;
        });
    }

    public function currentForRepresentative(int $representativeId): ?Trip
    {
        return Trip::query()->where('sales_representative_id', $representativeId)
            ->whereIn('status', [TripStatus::Planning, TripStatus::Operation, TripStatus::Ending])
            ->latest('id')->first();
    }

    private function requireStatus(Trip $trip, TripStatus $status): void
    {
        if ($trip->status !== $status) {
            throw new DomainConflictException("Only {$status->value} trips support this action.", 'INVALID_TRIP_STATE', ['current_status' => $trip->status->value]);
        }
    }

    private function metadata(Trip $trip): array
    {
        return $trip->only(['reference', 'warehouse_id', 'region_id', 'sales_representative_id', 'vehicle_id', 'status']);
    }
}
