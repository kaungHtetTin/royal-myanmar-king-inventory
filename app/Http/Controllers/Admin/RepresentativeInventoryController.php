<?php

namespace App\Http\Controllers\Admin;

use App\Enums\TransferStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\RepresentativeInventoryResource;
use App\Models\InTransitInventory;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Services\WarehouseAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class RepresentativeInventoryController extends Controller
{
    public function __construct(private readonly WarehouseAccess $warehouseAccess) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        $query = $this->withPending(RepresentativeInventory::query())
            ->with(['representative', 'product'])
            ->whereHas('representative', fn ($representative) => $representative->whereIn('primary_warehouse_id', $warehouseIds))
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('product_id', $id))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->whereHas('product', fn ($product) => $product->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")))
            ->orderBy('sales_representative_id')->orderBy('product_id');

        if (isset($data['representative_id']) && ! (clone $query)->where('sales_representative_id', $data['representative_id'])->exists()) {
            $inScope = SalesRepresentative::query()->whereKey($data['representative_id'])->whereIn('primary_warehouse_id', $warehouseIds)->exists();
            abort_unless($inScope, 403);
        }

        $matching = (clone $query)->get();
        $summary = ['total' => $matching->count(), 'units' => (int) $matching->sum('quantity'), 'products' => $matching->pluck('product_id')->unique()->count(), 'in_transit' => $matching->where('pending_quantity', '>', 0)->count()];

        return RepresentativeInventoryResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())->additional(['summary' => $summary]);
    }

    public static function withPending($query)
    {
        return $query->addSelect(['pending_quantity' => InTransitInventory::query()
            ->selectRaw('COALESCE(SUM(quantity), 0)')
            ->where('transfer_type', 'representative_transfer')
            ->whereColumn('product_id', 'representative_inventories.product_id')
            ->whereIn('transfer_id', RepresentativeTransfer::query()->select('id')
                ->whereColumn('sales_representative_id', 'representative_inventories.sales_representative_id')
                ->where('status', TransferStatus::Dispatched))]);
    }
}
