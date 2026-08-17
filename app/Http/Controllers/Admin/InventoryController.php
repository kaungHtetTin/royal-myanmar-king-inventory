<?php

namespace App\Http\Controllers\Admin;

use App\Enums\StockMovementType;
use App\Http\Controllers\Controller;
use App\Http\Resources\StockMovementResource;
use App\Http\Resources\WarehouseInventoryResource;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    public function __construct(private readonly WarehouseAccess $warehouseAccess) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'search' => ['nullable', 'string', 'max:100'],
            'stock' => ['nullable', Rule::in(['all', 'positive', 'zero'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }

        $query = WarehouseInventory::query()->with(['warehouse', 'product'])
            ->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('product_id', $id))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->whereHas('product', fn ($product) => $product
                ->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")))
            ->when(($data['stock'] ?? 'all') === 'positive', fn ($query) => $query->where('quantity', '>', 0))
            ->when(($data['stock'] ?? 'all') === 'zero', fn ($query) => $query->where('quantity', 0))
            ->orderBy('warehouse_id')->orderBy('product_id');

        return WarehouseInventoryResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
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

        return StockMovementResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function options(Request $request): JsonResponse
    {
        return response()->json([
            'warehouses' => $this->warehouseAccess->scope(Warehouse::query(), $request->user())->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'products' => Product::query()->where('is_active', true)->orderBy('name')->get(['id', 'sku', 'name', 'unit']),
            'movement_types' => collect(StockMovementType::cases())->pluck('value'),
        ]);
    }
}
