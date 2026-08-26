<?php

namespace App\Http\Controllers\Admin;

use App\Enums\StockMovementType;
use App\Http\Controllers\Controller;
use App\Http\Resources\StockMovementResource;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class InventoryController extends Controller
{
    public function __construct(private readonly WarehouseAccess $warehouseAccess) {}

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'search' => ['nullable', 'string', 'max:100'],
            'stock' => ['nullable', Rule::in(['all', 'positive', 'zero'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }

        $query = WarehouseInventory::query()
            ->selectRaw('product_id, SUM(quantity) as quantity, MAX(updated_at) as updated_at')
            ->with('product')
            ->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->whereHas('product', fn ($product) => $product
                ->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")))
            ->groupBy('product_id')
            ->when(($data['stock'] ?? 'all') === 'positive', fn ($query) => $query->havingRaw('SUM(quantity) > 0'))
            ->when(($data['stock'] ?? 'all') === 'zero', fn ($query) => $query->havingRaw('SUM(quantity) = 0'))
            ->orderBy('product_id');

        $matching = (clone $query)->get();
        $summary = ['total' => $matching->count(), 'units' => (int) $matching->sum('quantity'), 'warehouses' => isset($data['warehouse_id']) ? 1 : $warehouseIds->count(), 'products' => $matching->count()];
        $paginator = $query->paginate($data['per_page'] ?? 20)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => [
            'id' => $row->product_id,
            'product' => ['id' => $row->product->id, 'sku' => $row->product->sku, 'name' => $row->product->name, 'unit' => $row->product->unit],
            'quantity' => (int) $row->quantity,
            'updated_at' => $row->updated_at?->toISOString(),
        ]));

        return response()->json(['data' => $paginator->items(), 'meta' => [
            'current_page' => $paginator->currentPage(), 'from' => $paginator->firstItem(), 'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(), 'to' => $paginator->lastItem(), 'total' => $paginator->total(),
        ], 'summary' => $summary]);
    }

    public function export(Request $request): StreamedResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'search' => ['nullable', 'string', 'max:100'],
            'stock' => ['nullable', Rule::in(['all', 'positive', 'zero'])],
        ]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }

        $query = WarehouseInventory::query()
            ->selectRaw('product_id, SUM(quantity) as quantity, MAX(updated_at) as updated_at')
            ->with('product:id,sku,name,unit')
            ->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->whereHas('product', fn ($product) => $product
                ->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")))
            ->groupBy('product_id')
            ->when(($data['stock'] ?? 'all') === 'positive', fn ($query) => $query->havingRaw('SUM(quantity) > 0'))
            ->when(($data['stock'] ?? 'all') === 'zero', fn ($query) => $query->havingRaw('SUM(quantity) = 0'))
            ->orderBy('product_id');

        $filename = 'on-hand-stock-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(function () use ($query): void {
            $output = fopen('php://output', 'wb');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['SKU', 'Product', 'Base unit', 'On hand', 'Last changed']);
            foreach ($query->lazy(500) as $row) {
                fputcsv($output, [
                    $this->csvValue($row->product->sku),
                    $this->csvValue($row->product->name),
                    $this->csvValue($row->product->unit),
                    (int) $row->quantity,
                    $row->updated_at?->toISOString(),
                ]);
            }
            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function csvValue(?string $value): string
    {
        $value ??= '';

        return preg_match('/^[=+\-@]/', $value) ? "'{$value}" : $value;
    }

    public function movements(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'movement_type' => ['nullable', Rule::enum(StockMovementType::class)],
            'reference' => ['nullable', 'string', 'max:30'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }
        $query = StockMovement::query()->with(['product', 'actor'])
            ->where(function ($query) use ($warehouseIds): void {
                $query->where(fn ($from) => $from->where('from_location_type', 'warehouse')->whereIn('from_location_id', $warehouseIds))
                    ->orWhere(fn ($to) => $to->where('to_location_type', 'warehouse')->whereIn('to_location_id', $warehouseIds));
            })
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where(fn ($location) => $location
                ->where(fn ($from) => $from->where('from_location_type', 'warehouse')->where('from_location_id', $id))
                ->orWhere(fn ($to) => $to->where('to_location_type', 'warehouse')->where('to_location_id', $id))))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('product_id', $id))
            ->when($data['movement_type'] ?? null, fn ($query, $type) => $query->where('movement_type', $type))
            ->when($data['reference'] ?? null, fn ($query, $reference) => $query->where('reference', 'like', "%{$reference}%"))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('occurred_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('occurred_at', '<=', $date))
            ->latest('occurred_at')->latest('id');

        $matching = (clone $query)->get();
        $warehouseCount = $matching->flatMap(fn ($row) => collect([$row->from_location_type === 'warehouse' ? $row->from_location_id : null, $row->to_location_type === 'warehouse' ? $row->to_location_id : null]))->filter()->unique()->count();
        $summary = ['total' => $matching->count(), 'units' => (int) $matching->sum('quantity'), 'warehouses' => $warehouseCount, 'products' => $matching->pluck('product_id')->unique()->count()];

        return StockMovementResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())->additional(['summary' => $summary]);
    }

    public function options(Request $request): JsonResponse
    {
        return response()->json([
            'warehouses' => $this->warehouseAccess->scope(Warehouse::query(), $request->user())->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'products' => Product::query()->where('is_active', true)->orderBy('name')->get(['id', 'sku', 'name', 'unit', 'selling_price']),
            'movement_types' => collect(StockMovementType::cases())->pluck('value'),
        ]);
    }
}
