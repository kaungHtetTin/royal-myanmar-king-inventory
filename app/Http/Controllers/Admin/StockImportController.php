<?php

namespace App\Http\Controllers\Admin;

use App\Enums\InventoryDocumentStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Controller;
use App\Http\Resources\StockImportResource;
use App\Models\Product;
use App\Models\ProductUnit;
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
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

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
        $query = StockImport::query()->with(['warehouse', 'items.product', 'items.productUnit', 'creator', 'poster', 'voider'])
            ->withSum('items as total_quantity', 'base_quantity')
            ->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '<=', $date))
            ->latest('id');

        $matching = (clone $query)->get();
        $summary = ['total' => $matching->count(), 'units' => (int) $matching->sum('total_quantity'), 'warehouses' => $matching->pluck('warehouse_id')->unique()->count(), 'products' => $matching->flatMap->items->pluck('product_id')->unique()->count()];

        return StockImportResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())->additional(['summary' => $summary]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->assertWarehouseAccess($request, (int) $data['warehouse_id']);
        $import = DB::transaction(function () use ($request, $data): StockImport {
            $items = $this->prepareItems($request, $data['items']);
            $import = StockImport::query()->create([
                'reference' => $this->references->next('stock_import', 'IMP'),
                'warehouse_id' => $data['warehouse_id'],
                'status' => InventoryDocumentStatus::Draft,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);
            $import->items()->createMany($items);
            $this->auditLogger->record($request, 'stock_import.created', $request->user(), $import, ['new' => $data]);

            return $import;
        });

        return (new StockImportResource($this->load($import)))->response()->setStatusCode(201);
    }

    public function show(Request $request, StockImport $stockImport): StockImportResource
    {
        $this->assertWarehouseAccess($request, $stockImport->warehouse_id);

        return new StockImportResource($this->load($stockImport));
    }

    public function update(Request $request, StockImport $stockImport): StockImportResource
    {
        $this->assertWarehouseAccess($request, $stockImport->warehouse_id);
        $data = $request->validate($this->rules());
        $this->assertWarehouseAccess($request, (int) $data['warehouse_id']);
        DB::transaction(function () use ($request, $stockImport, $data): void {
            $items = $this->prepareItems($request, $data['items']);
            $stockImport = StockImport::query()->lockForUpdate()->findOrFail($stockImport->id);
            $this->requireDraft($stockImport);
            $old = $stockImport->load('items')->toArray();
            $stockImport->update(['warehouse_id' => $data['warehouse_id'], 'notes' => $data['notes'] ?? null]);
            $stockImport->items()->delete();
            $stockImport->items()->createMany($items);
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
            'items.*.product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:4294967295'],
            'items.*.selling_price' => ['nullable', 'integer', 'min:0', 'max:999999999999999'],
        ];
    }

    /** @param array<int, array<string, mixed>> $items
     * @return array<int, array<string, mixed>>
     */
    private function prepareItems(Request $request, array $items): array
    {
        foreach ($items as $index => &$item) {
            if (array_key_exists('selling_price', $item) && $item['selling_price'] !== null) {
                $product = Product::query()->lockForUpdate()->findOrFail($item['product_id']);
                $newPrice = (int) $item['selling_price'];
                if ($product->selling_price !== $newPrice) {
                    Gate::authorize('update', $product);
                    $oldPrice = $product->selling_price;
                    $product->update(['selling_price' => $newPrice]);
                    $this->auditLogger->record($request, 'product.price_updated', $request->user(), $product, [
                        'old' => ['selling_price' => $oldPrice], 'new' => ['selling_price' => $newPrice],
                        'source' => 'stock_import',
                    ]);
                }
            }

            $unit = isset($item['product_unit_id'])
                ? ProductUnit::query()
                    ->where('product_id', $item['product_id'])
                    ->where('is_active', true)
                    ->find($item['product_unit_id'])
                : ProductUnit::query()
                    ->where('product_id', $item['product_id'])
                    ->where('is_active', true)
                    ->where('is_base', true)
                    ->first();

            if (! $unit) {
                throw ValidationException::withMessages([
                    "items.{$index}.product_unit_id" => ['Select an active unit that belongs to this product.'],
                ]);
            }

            $quantity = (int) $item['quantity'];
            if ($quantity > intdiv(PHP_INT_MAX, $unit->conversion_factor)) {
                throw ValidationException::withMessages([
                    "items.{$index}.quantity" => ['The converted base quantity is too large.'],
                ]);
            }

            $item['product_unit_id'] = $unit->id;
            $item['base_quantity'] = $quantity * $unit->conversion_factor;
            unset($item['selling_price']);
        }
        unset($item);

        return $items;
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
        return $import->fresh(['warehouse', 'items.product', 'items.productUnit', 'creator', 'poster', 'voider']);
    }
}
