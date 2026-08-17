<?php

namespace App\Http\Controllers\Sales;

use App\Enums\CashSubmissionStatus;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\CashSubmissionResource;
use App\Models\CashSubmission;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeCashTransaction;
use App\Models\SalesRepresentative;
use App\Services\CashSubmissionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CashController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(private readonly CashSubmissionService $submissions) {}

    public function overview(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $hold = (int) RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount');
        $pending = (int) CashSubmission::query()->where('sales_representative_id', $representative->id)->where('status', CashSubmissionStatus::Pending)->sum('amount');
        $transactions = RepresentativeCashTransaction::query()->with('actor:id,name')->where('sales_representative_id', $representative->id)->latest('id')->limit(50)->get()->map(fn ($transaction) => [
            'id' => $transaction->id, 'type' => $transaction->transaction_type->value, 'amount_delta' => $transaction->amount_delta,
            'reference' => $transaction->reference, 'notes' => $transaction->notes, 'actor' => $transaction->actor ? ['id' => $transaction->actor->id, 'name' => $transaction->actor->name] : null,
            'occurred_at' => $transaction->occurred_at->toISOString(),
        ]);

        return response()->json(['representative' => ['id' => $representative->id, 'code' => $representative->code, 'name' => $representative->name], 'cash_hold' => $hold, 'pending_submissions' => $pending, 'available_to_submit' => max(0, $hold - $pending), 'transactions' => $transactions]);
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $representative = $this->representative($request);
        $data = $request->validate(['per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);

        return CashSubmissionResource::collection(CashSubmission::query()->with($this->relations())->where('sales_representative_id', $representative->id)->latest('id')->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function store(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $data = $request->validate(['amount' => ['required', 'integer', 'min:1', 'max:999999999999999'], 'notes' => ['nullable', 'string', 'max:2000']]);
        $result = $this->submissions->create($representative, (int) $data['amount'], $data['notes'] ?? null, $request->user(), $this->idempotencyKey($request), $request);

        return (new CashSubmissionResource(CashSubmission::query()->with($this->relations())->findOrFail($result['id'])))->response()->setStatusCode(201);
    }

    public function cancel(Request $request, CashSubmission $cashSubmission): CashSubmissionResource
    {
        $representative = $this->representative($request);
        abort_unless($cashSubmission->sales_representative_id === $representative->id, 403);
        $this->submissions->cancel($cashSubmission, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new CashSubmissionResource($cashSubmission->fresh($this->relations()));
    }

    private function representative(Request $request): SalesRepresentative
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);

        return $representative;
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['representative', 'warehouse', 'creator', 'confirmer', 'canceller', 'reverser'];
    }
}
