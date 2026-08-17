<?php

namespace App\Http\Controllers\Admin;

use App\Enums\InventoryDocumentStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Controller;
use App\Http\Resources\StockImportResource;
use App\Models\StockImport;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\StockImportPostingService;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StockImportController extends Controller
{
    public function __construct(
        private readonly WarehouseAccess $warehouseAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly StockImportPostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'status' => ['nullable', Rule::enum(InventoryDocumentStatus::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseIds($request);
        $this->assertWarehouseFilter($data['warehouse_id'] ?? null, $warehouseIds);
        $query = StockImport::query()->with(['warehouse', 'items.product', 'creator', 'poster', 'voider'])
            ->withSum('items as total_quantity', 'quantity')
            ->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '<=', $date))
            ->latest('id');

        return StockImportResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->assertWarehouseAccess($request, (int) $data['warehouse_id']);
        $import = DB::transaction(function () use ($request, $data): StockImport {
            $import = StockImport::query()->create([
                'reference' => $this->references->next('stock_import', 'IMP'),
                'warehouse_id' => $data['warehouse_id'],
                'status' => InventoryDocumentStatus::Draft,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);
            $import->items()->createMany($data['items']);
            $this->auditLogger->record($request, 'stock_import.created', $request->user(), $import, ['new' => $data]);

            return $import;
        });

        return (new StockImportResource($this->load($import)))->response()->setStatusCode(201);
    }

    public function update(Request $request, StockImport $stockImport): StockImportResource
    {
        $this->assertWarehouseAccess($request, $stockImport->warehouse_id);
        $data = $request->validate($this->rules());
        $this->assertWarehouseAccess($request, (int) $data['warehouse_id']);
        DB::transaction(function () use ($request, $stockImport, $data): void {
            $stockImport = StockImport::query()->lockForUpdate()->findOrFail($stockImport->id);
            $this->requireDraft($stockImport);
            $old = $stockImport->load('items')->toArray();
            $stockImport->update(['warehouse_id' => $data['warehouse_id'], 'notes' => $data['notes'] ?? null]);
            $stockImport->items()->delete();
            $stockImport->items()->createMany($data['items']);
            $this->auditLogger->record($request, 'stock_import.updated', $request->user(), $stockImport, ['old' => $old, 'new' => $data]);
        });

        return new StockImportResource($this->load($stockImport));
    }

    public function post(Request $request, StockImport $stockImport): StockImportResource
    {
        $this->assertWarehouseAccess($request, $stockImport->warehouse_id);
        $key = $this->idempotencyKey($request);
        $this->posting->post($stockImport, $request->user(), $key, $request);

        return new StockImportResource($this->load($stockImport));
    }

    public function void(Request $request, StockImport $stockImport): StockImportResource
    {
        $this->assertWarehouseAccess($request, $stockImport->warehouse_id);
        $data = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $this->posting->void($stockImport, $request->user(), $this->idempotencyKey($request), trim($data['reason']), $request);

        return new StockImportResource($this->load($stockImport));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'distinct', Rule::exists('products', 'id')->where('is_active', true)],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:4294967295'],
        ];
    }

    private function idempotencyKey(Request $request): string
    {
        $request->merge(['idempotency_key' => $request->header('Idempotency-Key')]);

        return $request->validate(['idempotency_key' => ['required', 'string', 'max:100']])['idempotency_key'];
    }

    private function assertWarehouseAccess(Request $request, int $warehouseId): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $warehouseId), 403);
    }

    private function warehouseIds(Request $request)
    {
        return $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
    }

    private function assertWarehouseFilter(mixed $id, $ids): void
    {
        if ($id !== null && ! $ids->contains((int) $id)) {
            abort(403);
        }
    }

    private function requireDraft(StockImport $import): void
    {
        if ($import->status !== InventoryDocumentStatus::Draft) {
            throw new DomainConflictException('Posted and voided stock imports are immutable.', 'INVALID_DOCUMENT_STATE');
        }
    }

    private function load(StockImport $import): StockImport
    {
        return $import->fresh(['warehouse', 'items.product', 'creator', 'poster', 'voider']);
    }
}
