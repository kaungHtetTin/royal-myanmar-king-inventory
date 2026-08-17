<?php

namespace App\Http\Controllers\Admin;

use App\Enums\AdjustmentType;
use App\Enums\InventoryDocumentStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Controller;
use App\Http\Resources\StockAdjustmentResource;
use App\Models\StockAdjustment;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\StockAdjustmentPostingService;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StockAdjustmentController extends Controller
{
    public function __construct(
        private readonly WarehouseAccess $warehouseAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly StockAdjustmentPostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'status' => ['nullable', Rule::enum(InventoryDocumentStatus::class)],
            'adjustment_type' => ['nullable', Rule::enum(AdjustmentType::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }
        $query = StockAdjustment::query()->with(['warehouse', 'product', 'creator', 'poster'])
            ->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('product_id', $id))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['adjustment_type'] ?? null, fn ($query, $type) => $query->where('adjustment_type', $type))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($builder) => $builder
                ->where('reference', 'like', "%{$search}%")->orWhere('reason', 'like', "%{$search}%")))
            ->latest('id');

        return StockAdjustmentResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->assertWarehouseAccess($request, (int) $data['warehouse_id']);
        $adjustment = DB::transaction(function () use ($request, $data): StockAdjustment {
            $adjustment = StockAdjustment::query()->create($data + [
                'reference' => $this->references->next('stock_adjustment', 'ADJ'),
                'status' => InventoryDocumentStatus::Draft,
                'created_by' => $request->user()->id,
            ]);
            $this->auditLogger->record($request, 'stock_adjustment.created', $request->user(), $adjustment, ['new' => $data]);

            return $adjustment;
        });

        return (new StockAdjustmentResource($this->load($adjustment)))->response()->setStatusCode(201);
    }

    public function update(Request $request, StockAdjustment $stockAdjustment): StockAdjustmentResource
    {
        $this->assertWarehouseAccess($request, $stockAdjustment->warehouse_id);
        $data = $request->validate($this->rules());
        $this->assertWarehouseAccess($request, (int) $data['warehouse_id']);
        DB::transaction(function () use ($request, $stockAdjustment, $data): void {
            $stockAdjustment = StockAdjustment::query()->lockForUpdate()->findOrFail($stockAdjustment->id);
            if ($stockAdjustment->status !== InventoryDocumentStatus::Draft) {
                throw new DomainConflictException('Posted stock adjustments are immutable.', 'INVALID_DOCUMENT_STATE');
            }
            $old = $stockAdjustment->toArray();
            $stockAdjustment->update($data);
            $this->auditLogger->record($request, 'stock_adjustment.updated', $request->user(), $stockAdjustment, ['old' => $old, 'new' => $data]);
        });

        return new StockAdjustmentResource($this->load($stockAdjustment));
    }

    public function post(Request $request, StockAdjustment $stockAdjustment): StockAdjustmentResource
    {
        $this->assertWarehouseAccess($request, $stockAdjustment->warehouse_id);
        $request->merge(['idempotency_key' => $request->header('Idempotency-Key')]);
        $key = $request->validate(['idempotency_key' => ['required', 'string', 'max:100']])['idempotency_key'];
        $this->posting->post($stockAdjustment, $request->user(), $key, $request);

        return new StockAdjustmentResource($this->load($stockAdjustment));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'product_id' => ['required', 'integer', Rule::exists('products', 'id')->where('is_active', true)],
            'adjustment_type' => ['required', Rule::enum(AdjustmentType::class)],
            'quantity' => ['required', 'integer', 'min:1', 'max:4294967295'],
            'reason' => ['required', 'string', 'max:500'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    private function assertWarehouseAccess(Request $request, int $warehouseId): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $warehouseId), 403);
    }

    private function load(StockAdjustment $adjustment): StockAdjustment
    {
        return $adjustment->fresh(['warehouse', 'product', 'creator', 'poster']);
    }
}
