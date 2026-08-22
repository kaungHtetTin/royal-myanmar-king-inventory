<?php

namespace App\Http\Controllers\Admin;

use App\Enums\SaleStatus;
use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\SaleItem;
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
    private const REPORTS = ['sales'];

    public function __construct(private readonly ReportScope $scope) {}

    public function options(Request $request): JsonResponse
    {
        $warehouseIds = $this->scope->warehouseIds($request->user());

        return response()->json([
            'warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->orderBy('name')->get(['id', 'code', 'name']),
            'reports' => self::REPORTS,
        ]);
    }

    public function show(Request $request, string $report): JsonResponse
    {
        abort_unless(in_array($report, self::REPORTS, true), 404);
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
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
        };
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

    private function response(string $report, LengthAwarePaginator $paginator, array $summary, array $analysis = []): JsonResponse
    {
        return response()->json(['report' => $report, 'data' => $paginator->items(), 'meta' => ['current_page' => $paginator->currentPage(), 'from' => $paginator->firstItem(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'to' => $paginator->lastItem(), 'total' => $paginator->total()], 'summary' => $summary, 'analysis' => $analysis, 'rules' => ['financial_totals' => 'posted_only', 'date' => 'posted_at_for_posted_otherwise_created_at']]);
    }
}
