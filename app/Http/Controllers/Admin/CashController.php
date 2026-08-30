<?php

namespace App\Http\Controllers\Admin;

use App\Enums\CashSubmissionStatus;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\CashSubmissionResource;
use App\Http\Resources\RepresentativeCashBalanceResource;
use App\Models\CashSubmission;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Services\CashSubmissionService;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class CashController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(private readonly WarehouseAccess $warehouseAccess, private readonly CashSubmissionService $submissions) {}

    public function balances(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'search' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $warehouseIds = $this->warehouseIds($request, $data['warehouse_id'] ?? null);
        $query = SalesRepresentative::query()->with(['primaryWarehouse:id,code,name', 'cashBalance'])->withSum(['cashSubmissions as pending_submissions' => fn ($query) => $query->where('status', CashSubmissionStatus::Pending)], 'amount')->whereIn('primary_warehouse_id', $warehouseIds)
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")))->orderBy('name');

        $matching = (clone $query)->get();
        $summary = [
            'cash_held' => (int) $matching->sum(fn ($representative) => $representative->cashBalance?->amount ?? 0),
            'pending_handover' => (int) $matching->sum('pending_submissions'),
        ];

        return RepresentativeCashBalanceResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function submissions(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'], 'status' => ['nullable', Rule::enum(CashSubmissionStatus::class)], 'search' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $warehouseIds = $this->warehouseIds($request, $data['warehouse_id'] ?? null);
        $query = CashSubmission::query()->with($this->relations())->whereIn('warehouse_id', $warehouseIds)->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('reference', 'like', "%{$search}%")->orWhereHas('representative', fn ($representative) => $representative->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))))->latest('id');

        return CashSubmissionResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sales_representative_id' => ['required', 'integer', Rule::exists('sales_representatives', 'id')->where('is_active', true)],
            'amount' => ['required', 'integer', 'min:1'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
        $representative = SalesRepresentative::query()->findOrFail($data['sales_representative_id']);
        abort_unless($this->warehouseAccess->allows($request->user(), $representative->primary_warehouse_id), 403);
        $result = $this->submissions->collectByAdmin($representative, (int) $data['amount'], $data['notes'] ?? null, $request->user(), $this->idempotencyKey($request), $request);

        return (new CashSubmissionResource(CashSubmission::query()->with($this->relations())->findOrFail($result['id'])))->response()->setStatusCode(201);
    }

    public function confirm(Request $request, CashSubmission $cashSubmission): CashSubmissionResource
    {
        $this->authorizeScope($request, $cashSubmission);
        $this->submissions->confirm($cashSubmission, $request->user(), $this->idempotencyKey($request), $request);

        return new CashSubmissionResource($cashSubmission->fresh($this->relations()));
    }

    public function reverse(Request $request, CashSubmission $cashSubmission): CashSubmissionResource
    {
        $this->authorizeScope($request, $cashSubmission);
        $this->submissions->reverse($cashSubmission, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new CashSubmissionResource($cashSubmission->fresh($this->relations()));
    }

    private function authorizeScope(Request $request, CashSubmission $submission): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $submission->warehouse_id), 403);
    }

    private function warehouseIds(Request $request, ?int $warehouseId)
    {
        $ids = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if ($warehouseId !== null && ! $ids->contains($warehouseId)) {
            abort(403);
        }

        return $warehouseId === null ? $ids : collect([$warehouseId]);
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['trip', 'representative', 'warehouse', 'creator', 'confirmer', 'canceller', 'reverser'];
    }
}
