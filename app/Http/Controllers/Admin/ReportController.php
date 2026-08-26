<?php

namespace App\Http\Controllers\Admin;

use App\Enums\SaleStatus;
use App\Enums\TransferStatus;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Region;
use App\Models\RepresentativeTransfer;
use App\Models\RepresentativeTransferItem;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Models\Way;
use App\Services\ReportScope;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    private const REPORTS = ['sales', 'way-sales-power', 'stock-issues'];

    public function __construct(private readonly ReportScope $scope) {}

    public function options(Request $request): JsonResponse
    {
        $warehouseIds = $this->scope->warehouseIds($request->user());

        return response()->json([
            'warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name']),
            'regions' => Region::query()->whereIn('warehouse_id', $warehouseIds)->orderBy('name')->get(['id', 'warehouse_id', 'name']),
            'ways' => Way::query()->whereHas('region', fn ($query) => $query->whereIn('warehouse_id', $warehouseIds))->orderBy('name')->get(['id', 'region_id', 'code', 'name']),
            'representatives' => SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name']),
            'products' => Product::query()->where('is_active', true)->orderBy('name')->get(['id', 'sku', 'name', 'unit']),
            'reports' => self::REPORTS,
        ]);
    }

    public function show(Request $request, string $report): JsonResponse
    {
        abort_unless(in_array($report, self::REPORTS, true), 404);
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'way_id' => ['nullable', 'integer', 'exists:ways,id'],
            'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'status' => ['nullable', Rule::in(['draft', 'posted', 'voided'])],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'sort' => ['nullable', Rule::in(['date', 'amount', 'status', 'reference'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->scope->warehouseIds($request->user(), isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null);

        return match ($report) {
            'sales' => $this->sales($data, $warehouseIds),
            'way-sales-power' => $this->waySalesPower($data, $warehouseIds),
            'stock-issues' => $this->stockIssues($data, $warehouseIds),
        };
    }

    public function exportWaySalesPower(Request $request): StreamedResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'way_id' => ['nullable', 'integer', 'exists:ways,id'],
            'status' => ['nullable', Rule::in(['draft', 'posted', 'voided'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);
        $warehouseIds = $this->scope->warehouseIds($request->user(), isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null);
        $query = $this->waySalesPowerRows($this->waySalesPowerBase($data, $warehouseIds), $data);
        $filename = 'way-sales-power-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(function () use ($query): void {
            $output = fopen('php://output', 'wb');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, [
                'Warehouse Code', 'Warehouse', 'Region', 'Way Code', 'Way', 'Representative Code',
                'Representative', 'Sales Amount (MMK)', 'Paid Base Units', 'FOC Base Units', 'Invoices', 'Customers',
            ]);
            foreach ($query->cursor() as $row) {
                fputcsv($output, [
                    $this->csvValue($row->warehouse_code),
                    $this->csvValue($row->warehouse_name),
                    $this->csvValue($row->region_name),
                    $this->csvValue($row->way_code),
                    $this->csvValue($row->way_name),
                    $this->csvValue($row->representative_code),
                    $this->csvValue($row->representative_name),
                    (int) $row->sales_amount,
                    (int) $row->paid_base_units,
                    (int) $row->foc_base_units,
                    (int) $row->invoices,
                    (int) $row->customers,
                ]);
            }
            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function exportStockIssues(Request $request): StreamedResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'region_id' => ['nullable', 'integer', 'exists:regions,id'],
            'way_id' => ['nullable', 'integer', 'exists:ways,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);
        $warehouseIds = $this->scope->warehouseIds($request->user(), isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null);
        $query = $this->stockIssueProductRows($this->stockIssueBase($data, $warehouseIds));
        $filename = 'stock-issues-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(function () use ($query): void {
            $output = fopen('php://output', 'wb');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, [
                'Product SKU', 'Product', 'Base Unit', 'Paid Base Units', 'FOC Base Units',
                'Total Issued Units', 'Issue Count', 'Representatives',
            ]);
            foreach ($query->cursor() as $row) {
                fputcsv($output, [
                    $this->csvValue($row->product_sku),
                    $this->csvValue($row->product_name),
                    $this->csvValue($row->product_unit),
                    (int) $row->paid_base_units,
                    (int) $row->foc_base_units,
                    (int) $row->total_issued_units,
                    (int) $row->issues,
                    (int) $row->representatives,
                ]);
            }
            fclose($output);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function stockIssues(array $data, $warehouseIds): JsonResponse
    {
        $base = $this->stockIssueBase($data, $warehouseIds);
        $paidBaseUnits = (int) RepresentativeTransferItem::query()
            ->whereIn('representative_transfer_id', (clone $base)->select('representative_transfers.id'))
            ->sum('base_quantity');
        $focBaseUnits = (int) RepresentativeTransferItem::query()
            ->whereIn('representative_transfer_id', (clone $base)->select('representative_transfers.id'))
            ->sum('foc_base_quantity');
        $summary = [
            'total_issued_units' => $paidBaseUnits + $focBaseUnits,
            'paid_base_units' => $paidBaseUnits,
            'foc_base_units' => $focBaseUnits,
            'issues' => (int) (clone $base)->count(),
            'representatives' => (int) (clone $base)->distinct()->count('sales_representative_id'),
            'products' => (int) RepresentativeTransferItem::query()
                ->whereIn('representative_transfer_id', (clone $base)->select('representative_transfers.id'))
                ->distinct()->count('product_id'),
        ];
        $paginator = $this->stockIssueProductRows($base)->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => $this->stockIssueProduct($row)));

        return $this->response('stock-issues', $paginator, $summary, [], [
            'stock_count' => 'paid_base_units_plus_foc_base_units',
            'date' => 'dispatched_at',
            'coverage_filters' => 'representative_region_assignment',
        ]);
    }

    private function stockIssueBase(array $data, $warehouseIds): Builder
    {
        return RepresentativeTransfer::query()
            ->where('direction', 'issue')
            ->whereIn('status', [TransferStatus::Dispatched->value, TransferStatus::Received->value])
            ->whereIn('source_warehouse_id', $warehouseIds)
            ->when($data['region_id'] ?? null, fn ($query, $id) => $query->whereHas(
                'representative.regions',
                fn ($regions) => $regions->where('regions.id', $id),
            ))
            ->when($data['way_id'] ?? null, fn ($query, $id) => $query->whereHas(
                'representative.regions.ways',
                fn ($ways) => $ways->where('ways.id', $id),
            ))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('dispatched_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('dispatched_at', '<=', $date));
    }

    private function stockIssueProductRows(Builder $base): Builder
    {
        return RepresentativeTransferItem::query()
            ->join('representative_transfers', 'representative_transfers.id', '=', 'representative_transfer_items.representative_transfer_id')
            ->join('products', 'products.id', '=', 'representative_transfer_items.product_id')
            ->whereIn('representative_transfer_items.representative_transfer_id', (clone $base)->select('representative_transfers.id'))
            ->selectRaw('products.id as product_id, products.sku as product_sku, products.name as product_name, products.unit as product_unit')
            ->selectRaw('SUM(representative_transfer_items.base_quantity) as paid_base_units')
            ->selectRaw('SUM(representative_transfer_items.foc_base_quantity) as foc_base_units')
            ->selectRaw('SUM(representative_transfer_items.base_quantity + representative_transfer_items.foc_base_quantity) as total_issued_units')
            ->selectRaw('COUNT(DISTINCT representative_transfers.id) as issues')
            ->selectRaw('COUNT(DISTINCT representative_transfers.sales_representative_id) as representatives')
            ->groupBy('products.id', 'products.sku', 'products.name', 'products.unit')
            ->orderByDesc('total_issued_units')
            ->orderBy('products.name');
    }

    private function stockIssueProduct($row): array
    {
        return [
            'product' => [
                'id' => (int) $row->product_id,
                'sku' => $row->product_sku,
                'name' => $row->product_name,
                'unit' => $row->product_unit,
            ],
            'paid_base_units' => (int) $row->paid_base_units,
            'foc_base_units' => (int) $row->foc_base_units,
            'total_issued_units' => (int) $row->total_issued_units,
            'issues' => (int) $row->issues,
            'representatives' => (int) $row->representatives,
        ];
    }

    private function waySalesPower(array $data, $warehouseIds): JsonResponse
    {
        $base = $this->waySalesPowerBase($data, $warehouseIds);

        $summary = [
            'gross_sales' => (int) (clone $base)->sum('total_amount'),
            'invoices' => (int) (clone $base)->count(),
            'customers' => (int) (clone $base)->distinct()->count('customer_id'),
            'paid_base_units' => (int) SaleItem::query()->whereIn('sale_id', (clone $base)->select('sales.id'))->sum('base_quantity'),
            'foc_base_units' => (int) SaleItem::query()->whereIn('sale_id', (clone $base)->select('sales.id'))->sum('foc_base_quantity'),
        ];

        $query = $this->waySalesPowerRows($base, $data);
        $paginator = $query->paginate($data['per_page'] ?? 25)->withQueryString();
        $paginator->setCollection($paginator->getCollection()->map(fn ($row) => [
            'way' => ['id' => $row->way_id, 'code' => $row->way_code, 'name' => $row->way_name],
            'region' => ['id' => $row->region_id, 'name' => $row->region_name],
            'representative' => ['id' => $row->representative_id, 'code' => $row->representative_code, 'name' => $row->representative_name],
            'sales_amount' => (int) $row->sales_amount, 'paid_base_units' => (int) $row->paid_base_units,
            'foc_base_units' => (int) $row->foc_base_units, 'invoices' => (int) $row->invoices, 'customers' => (int) $row->customers,
        ]));

        return $this->response('way-sales-power', $paginator, $summary, []);
    }

    private function waySalesPowerBase(array $data, $warehouseIds): Builder
    {
        $base = Sale::query()->where('sales.status', SaleStatus::Posted)->whereIn('sales.warehouse_id', $warehouseIds)
            ->when($data['region_id'] ?? null, fn ($query, $id) => $query->where('sales.region_id', $id))
            ->when($data['way_id'] ?? null, fn ($query, $id) => $query->where('sales.way_id', $id))
            ->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales.sales_representative_id', $id))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->whereHas('items', fn ($items) => $items->where('product_id', $id)));
        $this->documentDateRange($base, $data);

        return $base;
    }

    private function waySalesPowerRows(Builder $base, array $data): Builder
    {
        return (clone $base)->join('ways', 'ways.id', '=', 'sales.way_id')
            ->join('regions', 'regions.id', '=', 'sales.region_id')
            ->join('warehouses', 'warehouses.id', '=', 'regions.warehouse_id')
            ->join('sales_representatives', 'sales_representatives.id', '=', 'sales.sales_representative_id')
            ->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')
            ->selectRaw('warehouses.code warehouse_code, warehouses.name warehouse_name, ways.id way_id, ways.code way_code, ways.name way_name, regions.id region_id, regions.name region_name, sales_representatives.id representative_id, sales_representatives.code representative_code, sales_representatives.name representative_name, SUM(sale_items.line_total) sales_amount, SUM(sale_items.base_quantity) paid_base_units, SUM(sale_items.foc_base_quantity) foc_base_units, COUNT(DISTINCT sales.id) invoices, COUNT(DISTINCT sales.customer_id) customers')
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->where('sale_items.product_id', $id))
            ->groupBy('warehouses.code', 'warehouses.name', 'ways.id', 'ways.code', 'ways.name', 'regions.id', 'regions.name', 'sales_representatives.id', 'sales_representatives.code', 'sales_representatives.name')
            ->orderByDesc('sales_amount');
    }

    private function csvValue(?string $value): string
    {
        $value ??= '';

        return preg_match('/^[=+\-@]/', $value) ? "'{$value}" : $value;
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

    private function documentDateRange(Builder $query, array $data): void
    {
        $query->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '<=', $date));
    }

    private function warehouse($row): array
    {
        return ['id' => $row->id, 'code' => $row->code, 'name' => $row->name];
    }

    private function product($row): array
    {
        return ['id' => $row->id, 'sku' => $row->sku, 'name' => $row->name, 'category' => $row->category, 'unit' => $row->unit];
    }

    private function sale($row): array
    {
        return ['id' => $row->id, 'reference' => $row->reference, 'warehouse' => $this->warehouse($row->warehouse), 'representative' => ['id' => $row->representative->id, 'code' => $row->representative->code, 'name' => $row->representative->name], 'customer' => ['id' => $row->customer->id, 'code' => $row->customer->code, 'name' => $row->customer->name], 'items' => $row->items->map(fn ($item) => ['product' => $this->product($item->product), 'quantity' => $item->quantity]), 'total_quantity' => (int) $row->total_quantity, 'total_amount' => $row->total_amount, 'payment_type' => $row->payment_type->value, 'status' => $row->status->value, 'date' => ($row->posted_at ?? $row->created_at)?->toISOString()];
    }

    private function response(string $report, LengthAwarePaginator $paginator, array $summary, array $analysis = [], ?array $rules = null): JsonResponse
    {
        return response()->json(['report' => $report, 'data' => $paginator->items(), 'meta' => ['current_page' => $paginator->currentPage(), 'from' => $paginator->firstItem(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'to' => $paginator->lastItem(), 'total' => $paginator->total()], 'summary' => $summary, 'analysis' => $analysis, 'rules' => $rules ?? ['financial_totals' => 'posted_only', 'date' => 'posted_at_for_posted_otherwise_created_at']]);
    }
}
