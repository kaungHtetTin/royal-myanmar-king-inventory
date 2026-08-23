<?php

namespace App\Http\Controllers\Sales;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Enums\TransferStatus;
use App\Http\Controllers\Controller;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\Sale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);
        $todaySales = Sale::query()->where('sales_representative_id', $representative->id)->where('status', SaleStatus::Posted)->whereDate('posted_at', today());
        $sales = (clone $todaySales)->selectRaw('COALESCE(SUM(total_amount), 0) as total')
            ->selectRaw('COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) as cash', [PaymentType::Cash->value])
            ->selectRaw('COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) as credit', [PaymentType::Credit->value])->first();
        $stock = RepresentativeInventory::query()->with('product:id,sku,name,unit')->where('sales_representative_id', $representative->id)->where('quantity', '>', 0)->orderByDesc('quantity')->limit(6)->get();
        $pendingQuery = RepresentativeTransfer::query()->where('sales_representative_id', $representative->id)->where('status', TransferStatus::Dispatched);
        $pendingCount = (clone $pendingQuery)->count();
        $pending = $pendingQuery->with(['sourceWarehouse:id,code,name', 'items.product:id,sku,name,unit'])->withSum('items as total_quantity', 'quantity')->latest('dispatched_at')->limit(5)->get();
        $recentSales = Sale::query()->with('customer:id,code,name')->withSum('items as total_quantity', 'quantity')
            ->where('sales_representative_id', $representative->id)->latest('id')->limit(5)->get();

        return response()->json([
            'as_of' => now()->toISOString(), 'representative' => ['id' => $representative->id, 'code' => $representative->code, 'name' => $representative->name],
            'kpis' => ['stock_units' => (int) RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->sum('quantity'), 'stock_products' => RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->where('quantity', '>', 0)->count(), 'pending_receivings' => $pendingCount, 'today_sales' => (int) $sales->total, 'today_cash_sales' => (int) $sales->cash, 'today_credit_sales' => (int) $sales->credit, 'cash_hold' => (int) RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount')],
            'stock' => $stock->map(fn ($row) => ['id' => $row->id, 'quantity' => $row->quantity, 'product' => ['id' => $row->product->id, 'sku' => $row->product->sku, 'name' => $row->product->name, 'unit' => $row->product->unit]]),
            'pending_receivings' => $pending->map(fn (RepresentativeTransfer $transfer) => ['id' => $transfer->id, 'reference' => $transfer->reference, 'warehouse' => ['id' => $transfer->sourceWarehouse->id, 'code' => $transfer->sourceWarehouse->code, 'name' => $transfer->sourceWarehouse->name], 'total_quantity' => (int) $transfer->total_quantity, 'products' => $transfer->items->count(), 'items' => $transfer->items->map(fn ($item) => ['id' => $item->id, 'quantity' => $item->quantity, 'product' => ['id' => $item->product->id, 'sku' => $item->product->sku, 'name' => $item->product->name, 'unit' => $item->product->unit]]), 'dispatched_at' => $transfer->dispatched_at?->toISOString()]),
            'recent_sales' => $recentSales->map(fn (Sale $sale) => ['id' => $sale->id, 'reference' => $sale->reference, 'customer' => ['id' => $sale->customer->id, 'code' => $sale->customer->code, 'name' => $sale->customer->name], 'payment_type' => $sale->payment_type->value, 'status' => $sale->status->value, 'total_amount' => (int) $sale->total_amount, 'total_quantity' => (int) $sale->total_quantity, 'created_at' => $sale->created_at?->toISOString()]),
        ]);
    }
}
