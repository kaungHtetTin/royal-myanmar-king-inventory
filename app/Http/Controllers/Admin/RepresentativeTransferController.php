<?php

namespace App\Http\Controllers\Admin;

use App\Enums\TransferStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\RepresentativeTransferResource;
use App\Models\RepresentativeTransfer;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\RepresentativeTransferPostingService;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RepresentativeTransferController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly WarehouseAccess $warehouseAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly RepresentativeTransferPostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'],
            'status' => ['nullable', Rule::enum(TransferStatus::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseIds($request);
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }
        if (isset($data['representative_id'])) {
            $this->assertRepresentative($request, (int) $data['representative_id']);
        }
        $query = RepresentativeTransfer::query()->with($this->relations())->withSum('items as total_quantity', 'quantity')
            ->where('direction', 'issue')
            ->whereIn('source_warehouse_id', $warehouseIds)
            ->whereHas('representative', fn ($representative) => $representative->whereIn('primary_warehouse_id', $warehouseIds))
            ->where('status', '!=', TransferStatus::Cancelled)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('source_warehouse_id', $id))
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"))
            ->latest('id');

        $matching = (clone $query)->get();
        $summary = ['total' => $matching->count(), 'units' => (int) $matching->sum('total_quantity'), 'products' => $matching->flatMap->items->pluck('product_id')->unique()->count(), 'in_transit' => $matching->where('status', TransferStatus::Dispatched)->count()];

        return RepresentativeTransferResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())->additional(['summary' => $summary]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->assertWarehouse($request, (int) $data['source_warehouse_id']);
        $this->assertRepresentative($request, (int) $data['sales_representative_id']);
        $transfer = DB::transaction(function () use ($request, $data): RepresentativeTransfer {
            $transfer = RepresentativeTransfer::query()->create([
                'reference' => $this->references->next('representative_transfer', 'RTR'),
                'direction' => 'issue',
                'source_warehouse_id' => $data['source_warehouse_id'],
                'sales_representative_id' => $data['sales_representative_id'],
                'status' => TransferStatus::Draft,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);
            $transfer->items()->createMany($data['items']);
            $this->auditLogger->record($request, 'representative_transfer.created', $request->user(), $transfer, ['new' => $data]);

            return $transfer;
        });

        return (new RepresentativeTransferResource($this->load($transfer)))->response()->setStatusCode(201);
    }

    public function show(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $this->assertIssue($representativeTransfer);
        $this->assertScope($request, $representativeTransfer);

        return new RepresentativeTransferResource($this->load($representativeTransfer));
    }

    public function update(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $this->assertIssue($representativeTransfer);
        $this->assertScope($request, $representativeTransfer);
        $data = $request->validate($this->rules());
        $this->assertWarehouse($request, (int) $data['source_warehouse_id']);
        $this->assertRepresentative($request, (int) $data['sales_representative_id']);
        DB::transaction(function () use ($request, $representativeTransfer, $data): void {
            $representativeTransfer = RepresentativeTransfer::query()->lockForUpdate()->findOrFail($representativeTransfer->id);
            if ($representativeTransfer->status !== TransferStatus::Draft) {
                throw new DomainConflictException('Dispatched representative transfer lines are immutable.', 'INVALID_DOCUMENT_STATE');
            }
            $old = $representativeTransfer->load('items')->toArray();
            $representativeTransfer->update(['source_warehouse_id' => $data['source_warehouse_id'], 'sales_representative_id' => $data['sales_representative_id'], 'notes' => $data['notes'] ?? null]);
            $representativeTransfer->items()->delete();
            $representativeTransfer->items()->createMany($data['items']);
            $this->auditLogger->record($request, 'representative_transfer.updated', $request->user(), $representativeTransfer, ['old' => $old, 'new' => $data]);
        });

        return new RepresentativeTransferResource($this->load($representativeTransfer));
    }

    public function dispatch(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $this->assertIssue($representativeTransfer);
        $this->assertScope($request, $representativeTransfer);
        $this->posting->dispatch($representativeTransfer, $request->user(), $this->idempotencyKey($request), $request);

        return new RepresentativeTransferResource($this->load($representativeTransfer));
    }

    public function cancel(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $this->assertIssue($representativeTransfer);
        $this->assertScope($request, $representativeTransfer);
        $this->posting->cancel($representativeTransfer, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new RepresentativeTransferResource($this->load($representativeTransfer));
    }

    public function reverse(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $this->assertIssue($representativeTransfer);
        $this->assertScope($request, $representativeTransfer);
        $this->posting->reverse($representativeTransfer, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new RepresentativeTransferResource($this->load($representativeTransfer));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'source_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'sales_representative_id' => ['required', 'integer', Rule::exists('sales_representatives', 'id')->where('is_active', true)],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'distinct', Rule::exists('products', 'id')->where('is_active', true)],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:100'],
        ];
    }

    private function assertScope(Request $request, RepresentativeTransfer $transfer): void
    {
        $this->assertWarehouse($request, $transfer->source_warehouse_id);
        $this->assertRepresentative($request, $transfer->sales_representative_id);
    }

    private function assertIssue(RepresentativeTransfer $transfer): void
    {
        abort_unless($transfer->direction === 'issue', 404);
    }

    private function assertWarehouse(Request $request, int $warehouseId): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $warehouseId), 403);
    }

    private function assertRepresentative(Request $request, int $representativeId): void
    {
        $representative = SalesRepresentative::query()->findOrFail($representativeId);
        $this->assertWarehouse($request, $representative->primary_warehouse_id);
    }

    private function warehouseIds(Request $request)
    {
        return $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['sourceWarehouse', 'representative', 'items.product', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser'];
    }

    private function load(RepresentativeTransfer $transfer): RepresentativeTransfer
    {
        return $transfer->fresh($this->relations());
    }
}
