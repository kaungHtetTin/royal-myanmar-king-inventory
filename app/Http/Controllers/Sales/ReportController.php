<?php

namespace App\Http\Controllers\Sales;

use App\Enums\SaleStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function options(Request $request): JsonResponse
    {
        $representative = $this->representative($request);

        return response()->json([
            'customers' => Customer::query()->where('warehouse_id', $representative->primary_warehouse_id)->orderBy('name')->get(['id', 'code', 'name']),
            'products' => Product::query()->whereHas('saleItems.sale', fn ($sale) => $sale->where('sales_representative_id', $representative->id))->orderBy('name')->get(['id', 'sku', 'name', 'unit']),
        ]);
    }

    public function sales(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $data = $request->validate(['customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'product_id' => ['nullable', 'integer', 'exists:products,id'], 'payment_type' => ['nullable', Rule::in(['cash', 'credit'])], 'status' => ['nullable', Rule::in(['draft', 'posted', 'voided'])], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date', 'after_or_equal:date_from'], 'period' => ['nullable', Rule::in(['today'])], 'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $query = Sale::query()->where('sales_representative_id', $representative->id)
            ->when($data['customer_id'] ?? null, fn ($query, $id) => $query->where('customer_id', $id))->when($data['product_id'] ?? null, fn ($query, $id) => $query->whereHas('items', fn ($items) => $items->where('product_id', $id)))->when($data['payment_type'] ?? null, fn ($query, $type) => $query->where('payment_type', $type))->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status));
        if (($data['period'] ?? null) === 'today') {
            $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), today());
        } else {
            $query->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '>=', $date))->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '<=', $date));
        }
        $posted = (clone $query)->where('status', SaleStatus::Posted);
        $summaryRow = $posted->selectRaw('COALESCE(SUM(total_amount), 0) total, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) cash, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) credit', ['cash', 'credit'])->first();
        $summary = ['gross_sales' => (int) $summaryRow->total, 'cash_sales' => (int) $summaryRow->cash, 'credit_sales' => (int) $summaryRow->credit, 'units_sold' => (int) (clone $query)->where('sales.status', SaleStatus::Posted)->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')->sum('sale_items.quantity')];
        $query->with(['customer:id,code,name', 'items.product:id,sku,name,unit'])->withSum('items as total_quantity', 'quantity');
        $paginator = $query->latest(DB::raw('COALESCE(sales.posted_at, sales.created_at)'))->paginate($data['per_page'] ?? 20)->withQueryString();
        $rows = $paginator->getCollection()->map(fn (Sale $sale) => ['id' => $sale->id, 'reference' => $sale->reference, 'customer' => ['id' => $sale->customer->id, 'code' => $sale->customer->code, 'name' => $sale->customer->name], 'items' => $sale->items->map(fn ($item) => ['product' => ['id' => $item->product->id, 'sku' => $item->product->sku, 'name' => $item->product->name, 'unit' => $item->product->unit], 'quantity' => $item->quantity]), 'total_quantity' => (int) $sale->total_quantity, 'total_amount' => $sale->total_amount, 'payment_type' => $sale->payment_type->value, 'status' => $sale->status->value, 'date' => ($sale->posted_at ?? $sale->created_at)?->toISOString()]);

        return response()->json(['data' => $rows, 'summary' => $summary, 'meta' => ['current_page' => $paginator->currentPage(), 'from' => $paginator->firstItem(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'to' => $paginator->lastItem(), 'total' => $paginator->total()], 'rules' => ['financial_totals' => 'posted_only', 'document_rows' => 'all_statuses_unless_filtered']]);
    }

    private function representative(Request $request)
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);

        return $representative;
    }
}
