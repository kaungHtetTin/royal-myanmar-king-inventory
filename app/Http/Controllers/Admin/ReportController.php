<?php

namespace App\Http\Controllers\Admin;

use App\Enums\SaleStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\Product;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\RepresentativeTransferItem;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Models\WarehouseTransfer;
use App\Models\WarehouseTransferItem;
use App\Services\ReportScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    private const REPORTS = ['warehouse-stock', 'representative-stock', 'stock-movements', 'warehouse-transfers', 'representative-transfers', 'sales', 'cash-hold', 'customer-credit'];

    public function __construct(private readonly ReportScope $scope) {}

    public function options(Request $request): JsonResponse
    {
        $warehouseIds = $this->scope->warehouseIds($request->user());

        return response()->json([
            'warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name']),
            'representatives' => SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name', 'primary_warehouse_id', 'region']),
            'customers' => Customer::query()->whereIn('warehouse_id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name', 'warehouse_id']),
            'products' => Product::query()->orderBy('name')->get(['id', 'sku', 'name', 'category', 'unit']),
            'categories' => Product::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category'),
            'regions' => SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->whereNotNull('region')->distinct()->orderBy('region')->pluck('region'),
            'reports' => self::REPORTS,
        ]);
    }

    public function show(Request $request, string $report): JsonResponse
    {
        abort_unless(in_array($report, self::REPORTS, true), 404);
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'category' => ['nullable', 'string', 'max:100'], 'region' => ['nullable', 'string', 'max:100'], 'status' => ['nullable', 'string', 'max:40'],
            'payment_type' => ['nullable', Rule::in(['cash', 'credit'])], 'movement_type' => ['nullable', 'string', 'max:40'],
            'search' => ['nullable', 'string', 'max:100'], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'sort' => ['nullable', Rule::in(['quantity', 'product', 'warehouse', 'representative', 'customer', 'date', 'amount', 'status', 'reference'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->scope->warehouseIds($request->user(), isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null);

        return match ($report) {
            'warehouse-stock' => $this->warehouseStock($data, $warehouseIds),
            'representative-stock' => $this->representativeStock($data, $warehouseIds),
            'stock-movements' => $this->movements($data, $warehouseIds),
            'warehouse-transfers' => $this->warehouseTransfers($data, $warehouseIds),
            'representative-transfers' => $this->representativeTransfers($data, $warehouseIds),
            'sales' => $this->sales($data, $warehouseIds),
            'cash-hold' => $this->cash($data, $warehouseIds),
            'customer-credit' => $this->credit($data, $warehouseIds),
        };
    }

    private function warehouseStock(array $data, $warehouseIds): JsonResponse
    {
        $query = WarehouseInventory::query()->with(['warehouse:id,code,name', 'product:id,sku,name,category,unit'])->whereIn('warehouse_id', $warehouseIds)
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('product_id', $id))->when($data['category'] ?? null, fn ($query, $category) => $query->whereHas('product', fn ($product) => $product->where('category', $category)))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->whereHas('product', fn ($product) => $product->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")));
        $summary = ['units' => (int) (clone $query)->sum('quantity'), 'products' => (clone $query)->distinct('product_id')->count('product_id')];
        $this->stockSort($query, $data, 'warehouse_id');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => ['id' => $row->id, 'warehouse' => $this->warehouse($row->warehouse), 'product' => $this->product($row->product), 'quantity' => $row->quantity]));

        return $this->response('warehouse-stock', $paginator, $summary);
    }

    private function representativeStock(array $data, $warehouseIds): JsonResponse
    {
        $query = RepresentativeInventory::query()->with(['representative.primaryWarehouse:id,code,name', 'product:id,sku,name,category,unit'])->whereHas('representative', fn ($representative) => $representative->whereIn('primary_warehouse_id', $warehouseIds))
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('product_id', $id))
            ->when($data['region'] ?? null, fn ($query, $region) => $query->whereHas('representative', fn ($representative) => $representative->where('region', $region)))
            ->when($data['category'] ?? null, fn ($query, $category) => $query->whereHas('product', fn ($product) => $product->where('category', $category)))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($scope) => $scope->whereHas('product', fn ($product) => $product->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))->orWhereHas('representative', fn ($representative) => $representative->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))));
        $summary = ['units' => (int) (clone $query)->sum('quantity'), 'representatives' => (clone $query)->distinct('sales_representative_id')->count('sales_representative_id')];
        $this->stockSort($query, $data, 'sales_representative_id');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => ['id' => $row->id, 'representative' => $this->representative($row->representative), 'warehouse' => $this->warehouse($row->representative->primaryWarehouse), 'product' => $this->product($row->product), 'quantity' => $row->quantity]));

        return $this->response('representative-stock', $paginator, $summary);
    }

    private function movements(array $data, $warehouseIds): JsonResponse
    {
        $query = $this->scope->movements(StockMovement::query(), $warehouseIds)->with(['product:id,sku,name,category,unit', 'actor:id,name'])
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where(fn ($scope) => $scope->where(fn ($location) => $location->where('from_location_type', 'representative')->where('from_location_id', $id))->orWhere(fn ($location) => $location->where('to_location_type', 'representative')->where('to_location_id', $id))))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('product_id', $id))->when($data['movement_type'] ?? null, fn ($query, $type) => $query->where('movement_type', $type))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($scope) => $scope->where('reference', 'like', "%{$search}%")->orWhereHas('product', fn ($product) => $product->where('sku', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%"))));
        $this->dateRange($query, $data, 'occurred_at');
        $summary = ['units' => (int) (clone $query)->sum('quantity'), 'movements' => (clone $query)->count()];
        $sort = $data['sort'] ?? 'date';
        $query->orderBy($sort === 'quantity' ? 'quantity' : ($sort === 'reference' ? 'reference' : 'occurred_at'), $data['direction'] ?? 'desc');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => ['id' => $row->id, 'reference' => $row->reference, 'type' => $row->movement_type->value, 'product' => $this->product($row->product), 'quantity' => $row->quantity, 'from' => ['type' => $row->from_location_type, 'id' => $row->from_location_id], 'to' => ['type' => $row->to_location_type, 'id' => $row->to_location_id], 'actor' => ['id' => $row->actor->id, 'name' => $row->actor->name], 'occurred_at' => $row->occurred_at->toISOString()]));

        return $this->response('stock-movements', $paginator, $summary);
    }

    private function warehouseTransfers(array $data, $warehouseIds): JsonResponse
    {
        $query = WarehouseTransfer::query()->with(['sourceWarehouse:id,code,name', 'destinationWarehouse:id,code,name', 'items.product:id,sku,name,unit', 'creator:id,name', 'receiver:id,name'])->withSum('items as total_quantity', 'quantity')
            ->where(fn ($scope) => $scope->whereIn('source_warehouse_id', $warehouseIds)->orWhereIn('destination_warehouse_id', $warehouseIds))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->whereHas('items', fn ($items) => $items->where('product_id', $id)))->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"));
        $this->dateRange($query, $data, 'created_at');
        $summary = ['units' => (int) WarehouseTransferItem::query()->whereIn('warehouse_transfer_id', (clone $query)->select('warehouse_transfers.id'))->sum('quantity'), 'transfers' => (clone $query)->count()];
        $query->latest('created_at');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => $this->warehouseTransfer($row)));

        return $this->response('warehouse-transfers', $paginator, $summary);
    }

    private function representativeTransfers(array $data, $warehouseIds): JsonResponse
    {
        $query = RepresentativeTransfer::query()->with(['sourceWarehouse:id,code,name', 'representative:id,code,name', 'items.product:id,sku,name,unit', 'creator:id,name', 'receiver:id,name'])->withSum('items as total_quantity', 'quantity')->whereIn('source_warehouse_id', $warehouseIds)
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))->when($data['product_id'] ?? null, fn ($query, $id) => $query->whereHas('items', fn ($items) => $items->where('product_id', $id)))->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"));
        $this->dateRange($query, $data, 'created_at');
        $summary = ['units' => (int) RepresentativeTransferItem::query()->whereIn('representative_transfer_id', (clone $query)->select('representative_transfers.id'))->sum('quantity'), 'transfers' => (clone $query)->count()];
        $query->latest('created_at');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => $this->representativeTransfer($row)));

        return $this->response('representative-transfers', $paginator, $summary);
    }

    private function sales(array $data, $warehouseIds): JsonResponse
    {
        $query = Sale::query()->whereIn('warehouse_id', $warehouseIds)
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))->when($data['customer_id'] ?? null, fn ($query, $id) => $query->where('customer_id', $id))->when($data['product_id'] ?? null, fn ($query, $id) => $query->whereHas('items', fn ($items) => $items->where('product_id', $id)))->when($data['payment_type'] ?? null, fn ($query, $type) => $query->where('payment_type', $type))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"));
        $this->documentDateRange($query, $data);
        $posted = (clone $query)->where('status', SaleStatus::Posted);
        $summaryRow = $posted->selectRaw('COALESCE(SUM(total_amount), 0) total, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) cash, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) credit', ['cash', 'credit'])->first();
        $summary = ['gross_sales' => (int) $summaryRow->total, 'cash_sales' => (int) $summaryRow->cash, 'credit_sales' => (int) $summaryRow->credit, 'units_sold' => (int) (clone $query)->where('sales.status', SaleStatus::Posted)->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')->sum('sale_items.quantity')];
        $query->with(['warehouse:id,code,name', 'representative:id,code,name', 'customer:id,code,name', 'items.product:id,sku,name,unit'])->withSum('items as total_quantity', 'quantity');
        $sort = $data['sort'] ?? 'date';
        $query->orderBy($sort === 'amount' ? 'total_amount' : ($sort === 'reference' ? 'reference' : DB::raw('COALESCE(sales.posted_at, sales.created_at)')), $data['direction'] ?? 'desc');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => $this->sale($row)));

        return $this->response('sales', $paginator, $summary);
    }

    private function cash(array $data, $warehouseIds): JsonResponse
    {
        $query = SalesRepresentative::query()->with(['primaryWarehouse:id,code,name', 'cashBalance'])->whereIn('primary_warehouse_id', $warehouseIds)->when($data['representative_id'] ?? null, fn ($query, $id) => $query->whereKey($id))->when($data['region'] ?? null, fn ($query, $region) => $query->where('region', $region))->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($scope) => $scope->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")));
        $summary = ['cash_hold' => (int) RepresentativeCashBalance::query()->whereIn('sales_representative_id', (clone $query)->pluck('id'))->sum('amount'), 'representatives' => (clone $query)->count()];
        $query->orderBy(($data['sort'] ?? null) === 'representative' ? 'name' : 'id', $data['direction'] ?? 'asc');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => ['id' => $row->id, 'representative' => $this->representative($row), 'warehouse' => $this->warehouse($row->primaryWarehouse), 'cash_hold' => (int) ($row->cashBalance?->amount ?? 0)]));

        return $this->response('cash-hold', $paginator, $summary);
    }

    private function credit(array $data, $warehouseIds): JsonResponse
    {
        $query = Customer::query()->with(['warehouse:id,code,name', 'creditBalance'])->whereIn('warehouse_id', $warehouseIds)->when($data['customer_id'] ?? null, fn ($query, $id) => $query->whereKey($id))->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($scope) => $scope->where('code', 'like', "%{$search}%")->orWhere('name', 'like', "%{$search}%")));
        $ids = (clone $query)->pluck('id');
        $summary = ['outstanding' => (int) CustomerCreditBalance::query()->whereIn('customer_id', $ids)->sum('outstanding_amount'), 'credit_limit' => (int) (clone $query)->sum('credit_limit'), 'customers' => (clone $query)->count()];
        $query->orderBy(($data['sort'] ?? null) === 'customer' ? 'name' : 'id', $data['direction'] ?? 'asc');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(function ($row): array {
            $outstanding = (int) ($row->creditBalance?->outstanding_amount ?? 0);

            return ['id' => $row->id, 'customer' => ['id' => $row->id, 'code' => $row->code, 'name' => $row->name], 'warehouse' => $this->warehouse($row->warehouse), 'credit_allowed' => $row->credit_allowed, 'credit_limit' => $row->credit_limit, 'outstanding_amount' => $outstanding, 'available_credit' => max(0, $row->credit_limit - $outstanding)];
        }));

        return $this->response('customer-credit', $paginator, $summary);
    }

    private function stockSort(Builder $query, array $data, string $owner): void
    {
        $sort = $data['sort'] ?? null;
        $query->orderBy($sort === 'quantity' ? 'quantity' : $owner, $data['direction'] ?? ($sort === 'quantity' ? 'desc' : 'asc'))->orderBy('product_id');
    }

    private function dateRange(Builder $query, array $data, string $column): void
    {
        $query->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate($column, '>=', $date))->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate($column, '<=', $date));
    }

    private function documentDateRange(Builder $query, array $data): void
    {
        $query->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '>=', $date))->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '<=', $date));
    }

    private function warehouse($row): array
    {
        return ['id' => $row->id, 'code' => $row->code, 'name' => $row->name];
    }

    private function product($row): array
    {
        return ['id' => $row->id, 'sku' => $row->sku, 'name' => $row->name, 'category' => $row->category, 'unit' => $row->unit];
    }

    private function representative($row): array
    {
        return ['id' => $row->id, 'code' => $row->code, 'name' => $row->name];
    }

    private function warehouseTransfer($row): array
    {
        return ['id' => $row->id, 'reference' => $row->reference, 'source' => $this->warehouse($row->sourceWarehouse), 'destination' => $this->warehouse($row->destinationWarehouse), 'items' => $row->items->map(fn ($item) => ['product' => $this->product($item->product), 'quantity' => $item->quantity]), 'total_quantity' => (int) $row->total_quantity, 'status' => $row->status->value, 'created_by' => $row->creator?->name, 'received_by' => $row->receiver?->name, 'created_at' => $row->created_at?->toISOString(), 'received_at' => $row->received_at?->toISOString()];
    }

    private function representativeTransfer($row): array
    {
        return ['id' => $row->id, 'reference' => $row->reference, 'warehouse' => $this->warehouse($row->sourceWarehouse), 'representative' => $this->representative($row->representative), 'items' => $row->items->map(fn ($item) => ['product' => $this->product($item->product), 'quantity' => $item->quantity]), 'total_quantity' => (int) $row->total_quantity, 'status' => $row->status->value, 'dispatched_at' => $row->dispatched_at?->toISOString(), 'received_at' => $row->received_at?->toISOString()];
    }

    private function sale($row): array
    {
        return ['id' => $row->id, 'reference' => $row->reference, 'warehouse' => $this->warehouse($row->warehouse), 'representative' => $this->representative($row->representative), 'customer' => ['id' => $row->customer->id, 'code' => $row->customer->code, 'name' => $row->customer->name], 'items' => $row->items->map(fn ($item) => ['product' => $this->product($item->product), 'quantity' => $item->quantity]), 'total_quantity' => (int) $row->total_quantity, 'total_amount' => $row->total_amount, 'payment_type' => $row->payment_type->value, 'status' => $row->status->value, 'date' => ($row->posted_at ?? $row->created_at)?->toISOString()];
    }

    private function response(string $report, LengthAwarePaginator $paginator, array $summary): JsonResponse
    {
        return response()->json(['report' => $report, 'data' => $paginator->items(), 'meta' => ['current_page' => $paginator->currentPage(), 'from' => $paginator->firstItem(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'to' => $paginator->lastItem(), 'total' => $paginator->total()], 'summary' => $summary, 'rules' => ['financial_totals' => 'posted_only', 'document_rows' => 'all_statuses_unless_filtered', 'date' => 'posted_at_for_posted_otherwise_created_at']]);
    }
}
