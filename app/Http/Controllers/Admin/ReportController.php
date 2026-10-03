<?php

namespace App\Http\Controllers\Admin;

use App\Enums\SaleStatus;
use App\Http\Controllers\Controller;
use App\Models\Region;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Services\ReportScope;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function __construct(private readonly ReportScope $scope) {}

    public function options(Request $request): JsonResponse
    {
        $warehouseIds = $this->scope->warehouseIds($request->user());

        return response()->json([
            'warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name']),
            'regions' => Region::query()->whereIn('warehouse_id', $warehouseIds)->orderBy('name')->get(['id', 'name', 'warehouse_id']),
            'representatives' => SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->with('regions:id')->orderBy('name')->get(['id', 'code', 'name', 'primary_warehouse_id']),
            'reports' => ['sales', 'representatives', 'customers', 'trip'],
        ]);
    }

    public function show(Request $request, string $report): JsonResponse
    {
        abort_unless(in_array($report, ['sales', 'representatives', 'customers', 'trip'], true), 404);
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'],
            'status' => ['nullable', Rule::in(['draft', 'posted', 'voided'])],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'sort' => ['nullable', Rule::in(['date', 'amount', 'status', 'reference'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
            'min_amount' => ['nullable', 'numeric', 'min:0'],
        ]);
        $warehouseIds = $this->scope->warehouseIds(
            $request->user(),
            isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null,
        );

        return match ($report) {
            'trip' => $this->trip($data, $warehouseIds),
            'representatives' => $this->representatives($data, $warehouseIds),
            'customers' => $this->customers($data, $warehouseIds),
            default => $this->sales($data, $warehouseIds),
        };
    }

    private function trip(array $data, $warehouseIds): JsonResponse
    {
        $query = SaleItem::query()
            ->whereHas('sale', fn ($query) => $query->whereIn('warehouse_id', $warehouseIds)
                ->whereNotNull('trip_id')->where('status', SaleStatus::Posted)
                ->when($data['region_id'] ?? null, fn ($query, $id) => $query->where('region_id', $id))
                ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))
                ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('posted_at', '>=', $date))
                ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('posted_at', '<=', $date)))
            ->selectRaw('product_id, SUM(base_quantity) as quantity, SUM(line_total) as net_amount')
            ->with(['product:id,sku,name,unit', 'product.baseUnit', 'product.defaultSellingUnit'])
            ->groupBy('product_id');
        $paginator = $query->orderBy('product_id')->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => [
            'product' => array_merge($row->product->only(['id', 'sku', 'name', 'unit']), [
                'base_unit' => $row->product->baseUnit?->only(['name', 'conversion_factor']),
                'default_selling_unit' => $row->product->defaultSellingUnit?->only(['name', 'conversion_factor']),
            ]),
            'quantity' => (int) $row->quantity,
            'net_amount' => (int) $row->net_amount,
        ]));

        return $this->response('trip', $paginator, []);
    }

    private function sales(array $data, $warehouseIds): JsonResponse
    {
        $query = Sale::query()->whereIn('warehouse_id', $warehouseIds)
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"));
        $periodQuery = clone $query;
        $this->documentDateRange($query, $data);
        $posted = (clone $query)->where('status', SaleStatus::Posted);
        $summaryRow = $posted->selectRaw('COALESCE(SUM(total_amount), 0) total, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) cash, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) credit', ['cash', 'credit'])->first();
        $summary = [
            'month_sales' => (int) (clone $periodQuery)->where('status', SaleStatus::Posted)->whereBetween('posted_at', [today()->startOfMonth(), today()->endOfMonth()])->sum('total_amount'),
            'year_sales' => (int) (clone $periodQuery)->where('status', SaleStatus::Posted)->whereBetween('posted_at', [today()->startOfYear(), today()->endOfYear()])->sum('total_amount'),
            'gross_sales' => (int) $summaryRow->total,
            'cash_sales' => (int) $summaryRow->cash,
            'credit_sales' => (int) $summaryRow->credit,
            'units_sold' => (int) (clone $query)->where('sales.status', SaleStatus::Posted)->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')->sum('sale_items.quantity'),
        ];
        $yearDaily = (clone $periodQuery)->where('status', SaleStatus::Posted)->whereBetween('posted_at', [today()->startOfYear(), today()->endOfYear()])
            ->selectRaw('DATE(posted_at) as date, SUM(total_amount) as amount')->groupBy('date')->orderBy('date')->get();
        $dailyAmounts = $yearDaily->pluck('amount', 'date');
        $monthStart = CarbonImmutable::today()->startOfMonth();
        $monthTrend = collect(range(0, $monthStart->daysInMonth - 1))->map(function (int $offset) use ($dailyAmounts, $monthStart): array {
            $date = $monthStart->addDays($offset);

            return ['label' => $date->format('j'), 'date' => $date->toDateString(), 'amount' => (int) ($dailyAmounts[$date->toDateString()] ?? 0)];
        })->all();
        $monthlyAmounts = $yearDaily->groupBy(fn ($row) => CarbonImmutable::parse($row->date)->format('n'))->map(fn ($rows) => (int) $rows->sum('amount'));
        $yearTrend = collect(range(1, 12))->map(fn (int $month) => ['label' => CarbonImmutable::create(null, $month, 1)->format('M'), 'month' => $month, 'amount' => (int) ($monthlyAmounts[$month] ?? 0)])->all();
        $topProducts = SaleItem::query()->join('products', 'products.id', '=', 'sale_items.product_id')
            ->whereIn('sale_id', (clone $query)->where('status', SaleStatus::Posted)->select('sales.id'))
            ->selectRaw('products.id, products.sku, products.name, products.unit, SUM(sale_items.quantity) as units, SUM(sale_items.line_total) as amount')
            ->groupBy('products.id', 'products.sku', 'products.name', 'products.unit')->orderByDesc('units')->limit(8)->get()
            ->map(fn ($row) => ['product' => ['id' => $row->id, 'sku' => $row->sku, 'name' => $row->name, 'unit' => $row->unit], 'units' => (int) $row->units, 'amount' => (int) $row->amount])->values()->all();
        $query->with(['warehouse:id,code,name', 'representative:id,code,name', 'customer:id,code,name', 'items.product:id,sku,name,unit'])->withSum('items as total_quantity', 'quantity');
        $sort = $data['sort'] ?? 'date';
        $query->orderBy($sort === 'amount' ? 'total_amount' : ($sort === 'reference' ? 'reference' : DB::raw('COALESCE(sales.posted_at, sales.created_at)')), $data['direction'] ?? 'desc');
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => $this->sale($row)));

        return $this->response('sales', $paginator, $summary, ['month_trend' => $monthTrend, 'year_trend' => $yearTrend, 'top_products' => $topProducts]);
    }

    private function representatives(array $data, $warehouseIds): JsonResponse
    {
        $query = DB::table('sales')
            ->join('sales_representatives', 'sales_representatives.id', '=', 'sales.sales_representative_id')
            ->join('warehouses', 'warehouses.id', '=', 'sales.warehouse_id')
            ->whereIn('sales.warehouse_id', $warehouseIds)
            ->where('sales.status', SaleStatus::Posted->value)
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('sales.posted_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('sales.posted_at', '<=', $date))
            ->groupBy('sales_representatives.id', 'sales_representatives.code', 'sales_representatives.name', 'warehouses.id', 'warehouses.code', 'warehouses.name')
            ->selectRaw('sales_representatives.id representative_id, sales_representatives.code representative_code, sales_representatives.name representative_name, warehouses.id warehouse_id, warehouses.code warehouse_code, warehouses.name warehouse_name, COUNT(sales.id) sale_count, COUNT(DISTINCT sales.customer_id) customer_count, COALESCE(SUM(sales.total_amount), 0) sales_amount')
            ->havingRaw('COALESCE(SUM(sales.total_amount), 0) >= ?', [(int) ($data['min_amount'] ?? 0)]);

        $summary = DB::query()->fromSub(clone $query, 'representative_analysis')
            ->selectRaw('COUNT(*) analyzed_count, COALESCE(SUM(sales_amount), 0) total_amount, COALESCE(SUM(sale_count), 0) transaction_count')->first();
        $paginator = $query->orderByDesc('sales_amount')->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => [
            'representative' => ['id' => $row->representative_id, 'code' => $row->representative_code, 'name' => $row->representative_name],
            'warehouse' => ['id' => $row->warehouse_id, 'code' => $row->warehouse_code, 'name' => $row->warehouse_name],
            'sale_count' => (int) $row->sale_count,
            'customer_count' => (int) $row->customer_count,
            'sales_amount' => (int) $row->sales_amount,
        ]));

        return $this->response('representatives', $paginator, [
            'representatives' => (int) $summary->analyzed_count,
            'sales_amount' => (int) $summary->total_amount,
            'transactions' => (int) $summary->transaction_count,
        ]);
    }

    private function customers(array $data, $warehouseIds): JsonResponse
    {
        $query = DB::table('sales')
            ->join('customers', 'customers.id', '=', 'sales.customer_id')
            ->join('warehouses', 'warehouses.id', '=', 'sales.warehouse_id')
            ->whereIn('sales.warehouse_id', $warehouseIds)
            ->where('sales.status', SaleStatus::Posted->value)
            ->when($data['region_id'] ?? null, fn ($query, $id) => $query->where('sales.region_id', $id))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('sales.posted_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('sales.posted_at', '<=', $date))
            ->groupBy('customers.id', 'customers.code', 'customers.name', 'warehouses.id', 'warehouses.code', 'warehouses.name')
            ->selectRaw('customers.id customer_id, customers.code customer_code, customers.name customer_name, warehouses.id warehouse_id, warehouses.code warehouse_code, warehouses.name warehouse_name, COUNT(sales.id) purchase_count, COALESCE(SUM(sales.total_amount), 0) purchase_amount, MAX(sales.posted_at) last_purchase_at')
            ->havingRaw('COALESCE(SUM(sales.total_amount), 0) >= ?', [(int) ($data['min_amount'] ?? 0)]);

        $summary = DB::query()->fromSub(clone $query, 'customer_analysis')
            ->selectRaw('COUNT(*) analyzed_count, COALESCE(SUM(purchase_amount), 0) total_amount, COALESCE(SUM(purchase_count), 0) transaction_count')->first();
        $paginator = $query->orderByDesc('purchase_amount')->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => [
            'customer' => ['id' => $row->customer_id, 'code' => $row->customer_code, 'name' => $row->customer_name],
            'warehouse' => ['id' => $row->warehouse_id, 'code' => $row->warehouse_code, 'name' => $row->warehouse_name],
            'purchase_count' => (int) $row->purchase_count,
            'purchase_amount' => (int) $row->purchase_amount,
            'last_purchase_at' => $row->last_purchase_at,
        ]));

        return $this->response('customers', $paginator, [
            'customers' => (int) $summary->analyzed_count,
            'purchase_amount' => (int) $summary->total_amount,
            'transactions' => (int) $summary->transaction_count,
        ]);
    }

    private function documentDateRange(Builder $query, array $data): void
    {
        $query->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '<=', $date));
    }

    private function sale($row): array
    {
        return ['id' => $row->id, 'reference' => $row->reference, 'warehouse' => $row->warehouse->only(['id', 'code', 'name']), 'representative' => $row->representative->only(['id', 'code', 'name']), 'customer' => $row->customer->only(['id', 'code', 'name']), 'items' => $row->items->map(fn ($item) => ['product' => $item->product->only(['id', 'sku', 'name', 'unit']), 'quantity' => $item->quantity]), 'total_quantity' => (int) $row->total_quantity, 'total_amount' => $row->total_amount, 'payment_type' => $row->payment_type->value, 'status' => $row->status->value, 'date' => ($row->posted_at ?? $row->created_at)?->toISOString()];
    }

    private function response(string $report, LengthAwarePaginator $paginator, array $summary, array $analysis = []): JsonResponse
    {
        return response()->json(['report' => $report, 'data' => $paginator->items(), 'meta' => ['current_page' => $paginator->currentPage(), 'from' => $paginator->firstItem(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'to' => $paginator->lastItem(), 'total' => $paginator->total()], 'summary' => $summary, 'analysis' => $analysis, 'rules' => ['financial_totals' => 'posted_only', 'date' => 'posted_at_for_posted_otherwise_created_at']]);
    }
}
