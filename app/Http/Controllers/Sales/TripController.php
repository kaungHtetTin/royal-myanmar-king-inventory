<?php

namespace App\Http\Controllers\Sales;

use App\Enums\TripStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Controller;
use App\Http\Resources\TripResource;
use App\Models\SalesRepresentative;
use App\Models\Trip;
use App\Services\AuditLogger;
use App\Services\TripWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TripController extends Controller
{
    public function __construct(private readonly TripWorkflowService $workflow, private readonly AuditLogger $auditLogger) {}

    public function current(Request $request): JsonResponse|TripResource
    {
        $trip = $this->workflow->currentForRepresentative($this->representative($request)->id);
        if (! $trip) {
            return response()->json(['data' => null]);
        }

        return new TripResource($this->load($trip));
    }

    public function expense(Request $request, Trip $trip): JsonResponse
    {
        $representative = $this->representative($request);
        abort_unless($trip->sales_representative_id === $representative->id, 403);
        if ($trip->status !== TripStatus::Operation) {
            throw new DomainConflictException('Expenses can only be recorded during trip operation.', 'INVALID_TRIP_STATE');
        }
        $data = $request->validate([
            'description' => ['required', 'string', 'max:200'],
            'amount' => ['required', 'integer', 'min:1', 'max:999999999999999'],
            'spent_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
        $expense = $trip->expenses()->create($data + ['spent_at' => $data['spent_at'] ?? now(), 'created_by' => $request->user()->id]);
        $this->auditLogger->record($request, 'trip_expense.created', $request->user(), $expense, ['trip_id' => $trip->id, 'amount' => $expense->amount]);

        return response()->json(['expense' => ['id' => $expense->id, 'description' => $expense->description, 'amount' => $expense->amount, 'spent_at' => $expense->spent_at->toISOString(), 'notes' => $expense->notes]], 201);
    }

    public function beginEnding(Request $request, Trip $trip): TripResource
    {
        $representative = $this->representative($request);
        abort_unless($trip->sales_representative_id === $representative->id, 403);

        return new TripResource($this->load($this->workflow->beginEnding($trip, $request->user(), $request)));
    }

    private function representative(Request $request): SalesRepresentative
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);

        return $representative;
    }

    private function load(Trip $trip): Trip
    {
        return $trip->fresh(['warehouse', 'region', 'representative', 'vehicle', 'creator', 'starter', 'endingActor', 'completer', 'canceller', 'transfers.sourceWarehouse', 'transfers.representative', 'transfers.items.product', 'transfers.items.unit', 'transfers.items.focUnit', 'transfers.transit', 'transfers.creator', 'transfers.dispatcher', 'transfers.receiver', 'transfers.canceller', 'transfers.reverser', 'sales.representative', 'sales.warehouse', 'sales.region', 'sales.customer', 'sales.items.product', 'sales.items.unit', 'sales.items.focUnit', 'sales.creator', 'sales.poster', 'sales.voider', 'expenses.creator', 'cashSubmissions.representative', 'cashSubmissions.warehouse', 'cashSubmissions.creator', 'cashSubmissions.confirmer', 'cashSubmissions.canceller', 'cashSubmissions.reverser', 'customerPayments']);
    }
}
