<?php

namespace App\Http\Controllers\Admin;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Sale;
use App\Models\Warehouse;
use App\Services\SalePostingService;
use App\Services\WarehouseAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class SaleController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(private readonly WarehouseAccess $warehouseAccess, private readonly SalePostingService $posting) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'], 'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'status' => ['nullable', Rule::enum(SaleStatus::class)], 'payment_type' => ['nullable', Rule::enum(PaymentType::class)], 'search' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }
        $query = Sale::query()->with(['representative', 'warehouse', 'customer', 'items.product', 'creator', 'poster', 'voider'])->withSum('items as total_quantity', 'quantity')->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))->when($data['customer_id'] ?? null, fn ($query, $id) => $query->where('customer_id', $id))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))->when($data['payment_type'] ?? null, fn ($query, $type) => $query->where('payment_type', $type))->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"))->latest('id');

        return SaleResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function void(Request $request, Sale $sale): SaleResource
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $sale->warehouse_id), 403);
        $this->posting->void($sale, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new SaleResource($sale->fresh(['representative', 'warehouse', 'customer', 'items.product', 'creator', 'poster', 'voider']));
    }
}
