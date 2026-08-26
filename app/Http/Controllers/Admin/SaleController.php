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
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class SaleController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(private readonly WarehouseAccess $warehouseAccess, private readonly SalePostingService $posting) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'representative_id' => ['nullable', 'integer', 'exists:sales_representatives,id'], 'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'status' => ['nullable', Rule::enum(SaleStatus::class)], 'payment_type' => ['nullable', Rule::enum(PaymentType::class)], 'period' => ['nullable', Rule::in(['today', '7_days', '30_days', 'this_month'])], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date', 'after_or_equal:date_from'], 'search' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $warehouseIds = $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }
        $query = Sale::query()->with(['representative', 'warehouse', 'region', 'way', 'customer', 'items.product', 'items.unit', 'items.focUnit', 'creator', 'poster', 'voider'])->withSum('items as total_quantity', 'quantity')->whereIn('warehouse_id', $warehouseIds)
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where('warehouse_id', $id))->when($data['representative_id'] ?? null, fn ($query, $id) => $query->where('sales_representative_id', $id))->when($data['customer_id'] ?? null, fn ($query, $id) => $query->where('customer_id', $id))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))->when($data['payment_type'] ?? null, fn ($query, $type) => $query->where('payment_type', $type))->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"));
        $this->period($query, $data['period'] ?? null);
        $this->dateRange($query, $data['date_from'] ?? null, $data['date_to'] ?? null);
        $summaryQuery = clone $query;
        $posted = (clone $summaryQuery)->where('status', SaleStatus::Posted);
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'posted_total' => (int) (clone $posted)->sum('total_amount'),
            'cash_total' => (int) (clone $posted)->where('payment_type', PaymentType::Cash)->sum('total_amount'),
            'credit_total' => (int) (clone $posted)->where('payment_type', PaymentType::Credit)->sum('total_amount'),
        ];
        $query->latest('id');

        return SaleResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    private function period($query, ?string $period): void
    {
        $range = match ($period) {
            'today' => [today()->startOfDay(), today()->endOfDay()],
            '7_days' => [today()->subDays(6)->startOfDay(), today()->endOfDay()],
            '30_days' => [today()->subDays(29)->startOfDay(), today()->endOfDay()],
            'this_month' => [today()->startOfMonth(), today()->endOfMonth()],
            default => null,
        };
        if (! $range) {
            return;
        }

        $query->where(fn ($scope) => $scope
            ->whereBetween('sales.posted_at', $range)
            ->orWhere(fn ($drafts) => $drafts->whereNull('sales.posted_at')->whereBetween('sales.created_at', $range)));
    }

    private function dateRange($query, ?string $from, ?string $to): void
    {
        if ($from) {
            $this->effectiveDateBoundary($query, '>=', CarbonImmutable::parse($from)->startOfDay());
        }
        if ($to) {
            $this->effectiveDateBoundary($query, '<=', CarbonImmutable::parse($to)->endOfDay());
        }
    }

    private function effectiveDateBoundary($query, string $operator, CarbonImmutable $boundary): void
    {
        $query->where(fn ($scope) => $scope
            ->where('sales.posted_at', $operator, $boundary)
            ->orWhere(fn ($drafts) => $drafts->whereNull('sales.posted_at')->where('sales.created_at', $operator, $boundary)));
    }

    public function void(Request $request, Sale $sale): SaleResource
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $sale->warehouse_id), 403);
        $this->posting->void($sale, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new SaleResource($sale->fresh(['representative', 'warehouse', 'region', 'way', 'customer', 'items.product', 'items.unit', 'items.focUnit', 'creator', 'poster', 'voider']));
    }

    public function show(Request $request, Sale $sale): SaleResource
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $sale->warehouse_id), 403);

        return new SaleResource($sale->load(['representative', 'warehouse', 'region', 'way', 'customer', 'items.product', 'items.unit', 'items.focUnit', 'creator', 'poster', 'voider']));
    }
}
