<?php

namespace App\Http\Controllers\Admin;

use App\Enums\CashSubmissionStatus;
use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Enums\TransferStatus;
use App\Http\Controllers\Controller;
use App\Models\ApplicationSetting;
use App\Models\CashSubmission;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\Product;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeTransfer;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Models\WarehouseTransfer;
use App\Services\ReportScope;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __construct(private readonly ReportScope $scope) {}

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id']]);
        $warehouseIds = $this->scope->warehouseIds($request->user(), isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null);
        $representativeIds = SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->pluck('id');
        $customerIds = Customer::query()->whereIn('warehouse_id', $warehouseIds)->pluck('id');
        $todaySales = Sale::query()->whereIn('warehouse_id', $warehouseIds)->where('status', SaleStatus::Posted)->whereDate('posted_at', today());
        $sales = (clone $todaySales)->selectRaw('COALESCE(SUM(total_amount), 0) as total')
            ->selectRaw('COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) as cash', [PaymentType::Cash->value])
            ->selectRaw('COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) as credit', [PaymentType::Credit->value])->first();
        $movements = $this->scope->movements(StockMovement::query(), $warehouseIds)->with(['product:id,sku,name,unit', 'actor:id,name'])->latest('occurred_at')->limit(8)->get()->map(fn (StockMovement $movement) => [
            'id' => $movement->id, 'reference' => $movement->reference, 'type' => $movement->movement_type->value,
            'product' => ['id' => $movement->product->id, 'sku' => $movement->product->sku, 'name' => $movement->product->name, 'unit' => $movement->product->unit],
            'quantity' => $movement->quantity, 'from_type' => $movement->from_location_type, 'from_id' => $movement->from_location_id,
            'to_type' => $movement->to_location_type, 'to_id' => $movement->to_location_id,
            'actor' => ['id' => $movement->actor->id, 'name' => $movement->actor->name], 'occurred_at' => $movement->occurred_at->toISOString(),
        ]);
        $lowStockThreshold = ApplicationSetting::current()->low_stock_threshold;
        $lowStockProducts = WarehouseInventory::query()->whereIn('warehouse_id', $warehouseIds)
            ->select('product_id')->groupBy('product_id')->havingRaw('SUM(quantity) <= ?', [$lowStockThreshold])->get()->count();

        return response()->json([
            'as_of' => now()->toISOString(),
            'warehouses' => $this->scope->warehouseIds($request->user())->isEmpty() ? [] : Warehouse::query()->whereIn('id', $this->scope->warehouseIds($request->user()))->orderBy('name')->get(['id', 'code', 'name']),
            'selected_warehouse_id' => $data['warehouse_id'] ?? null,
            'kpis' => [
                'warehouse_stock' => (int) WarehouseInventory::query()->whereIn('warehouse_id', $warehouseIds)->sum('quantity'),
                'products' => Product::query()->where('is_active', true)->count(),
                'active_representatives' => SalesRepresentative::query()->whereIn('id', $representativeIds)->where('is_active', true)->count(),
                'today_sales' => (int) $sales->total, 'today_cash_sales' => (int) $sales->cash, 'today_credit_sales' => (int) $sales->credit,
                'customer_outstanding' => (int) CustomerCreditBalance::query()->whereIn('customer_id', $customerIds)->sum('outstanding_amount'),
                'representative_cash' => (int) RepresentativeCashBalance::query()->whereIn('sales_representative_id', $representativeIds)->sum('amount'),
                'pending_warehouse_transfers' => WarehouseTransfer::query()->where('status', TransferStatus::Dispatched)->where(fn ($query) => $query->whereIn('source_warehouse_id', $warehouseIds)->orWhereIn('destination_warehouse_id', $warehouseIds))->count(),
                'pending_representative_receivings' => RepresentativeTransfer::query()->whereIn('source_warehouse_id', $warehouseIds)->where('status', TransferStatus::Dispatched)->count(),
                'pending_cash_submissions' => CashSubmission::query()->whereIn('warehouse_id', $warehouseIds)->where('status', CashSubmissionStatus::Pending)->count(),
                'low_stock_products' => $lowStockProducts,
                'low_stock_threshold' => $lowStockThreshold,
            ],
            'recent_movements' => $movements,
        ]);
    }
}
