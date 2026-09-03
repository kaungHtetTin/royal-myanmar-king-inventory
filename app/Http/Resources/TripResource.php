<?php

namespace App\Http\Resources;

use App\Enums\CashSubmissionStatus;
use App\Enums\CustomerPaymentStatus;
use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Enums\TransferStatus;
use App\Models\CustomerCreditBalance;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Services\PaymentMethodRegistry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TripResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $transfers = $this->whenLoaded('transfers', fn () => $this->transfers, collect());
        $sales = $this->whenLoaded('sales', fn () => $this->sales, collect());
        $expenses = $this->whenLoaded('expenses', fn () => $this->expenses, collect());
        $submissions = $this->whenLoaded('cashSubmissions', fn () => $this->cashSubmissions, collect());
        $payments = $this->whenLoaded('customerPayments', fn () => $this->customerPayments, collect());

        $result = [
            'id' => $this->id,
            'reference' => $this->reference,
            'title' => $this->title,
            'status' => $this->status->value,
            'warehouse' => $this->relationLoaded('warehouse') ? $this->warehouse?->only(['id', 'code', 'name']) : null,
            'region' => $this->relationLoaded('region') ? $this->region?->only(['id', 'name', 'warehouse_id']) : null,
            'representative' => $this->relationLoaded('representative') ? $this->representative?->only(['id', 'code', 'name', 'phone']) : null,
            'vehicle' => $this->relationLoaded('vehicle') ? $this->vehicle?->only(['id', 'vehicle_number', 'vehicle_type', 'brand', 'model']) : null,
            'notes' => $this->notes,
            'opening_cash_balance' => $this->opening_cash_balance,
            'stock_variance_units' => $this->stock_variance_units,
            'cash_variance_amount' => $this->cash_variance_amount,
            'completion_notes' => $this->completion_notes,
            'created_by' => $this->relationLoaded('creator') ? $this->actor($this->creator) : null,
            'started_by' => $this->relationLoaded('starter') ? $this->actor($this->starter) : null,
            'ending_by' => $this->relationLoaded('endingActor') ? $this->actor($this->endingActor) : null,
            'completed_by' => $this->relationLoaded('completer') ? $this->actor($this->completer) : null,
            'cancelled_by' => $this->relationLoaded('canceller') ? $this->actor($this->canceller) : null,
            'created_at' => $this->created_at?->toISOString(),
            'started_at' => $this->started_at?->toISOString(),
            'ending_at' => $this->ending_at?->toISOString(),
            'completed_at' => $this->completed_at?->toISOString(),
            'cancelled_at' => $this->cancelled_at?->toISOString(),
            'cancel_reason' => $this->cancel_reason,
        ];

        if ($this->relationLoaded('transfers')) {
            $result['stock_issues'] = RepresentativeTransferResource::collection($transfers->where('direction', 'issue')->values());
            $result['stock_returns'] = RepresentativeTransferResource::collection($transfers->where('direction', 'return')->values());
            $result['sales'] = SaleResource::collection($sales->values());
            $result['expenses'] = $expenses->map(fn ($expense) => [
                'id' => $expense->id, 'description' => $expense->description, 'amount' => $expense->amount,
                'spent_at' => $expense->spent_at?->toISOString(), 'notes' => $expense->notes,
                'created_by' => $this->actor($expense->creator),
            ])->values();
            $result['cash_submissions'] = CashSubmissionResource::collection($submissions->values());
            $result['customer_payments'] = CustomerPaymentResource::collection($payments->values());
            $result['product_summary'] = $this->productSummary($transfers, $sales);
            $result['financial_summary'] = $this->financialSummary($sales, $expenses, $submissions, $payments);
            $result['current_stock_units'] = (int) RepresentativeInventory::query()->where('sales_representative_id', $this->sales_representative_id)
                ->get(['quantity', 'foc_quantity'])->sum(fn ($row) => $row->quantity + $row->foc_quantity);
        }

        return $result;
    }

    private function productSummary($transfers, $sales): array
    {
        $rows = collect();
        $add = function ($item, string $paid, string $foc) use ($rows): void {
            $row = $rows->get($item->product_id, [
                'product' => [
                    ...$item->product->only(['id', 'sku', 'name', 'unit']),
                    'base_unit' => $item->product->baseUnit?->only(['id', 'name', 'conversion_factor']),
                    'default_selling_unit' => $item->product->defaultSellingUnit?->only(['id', 'name', 'conversion_factor']),
                ],
                'issued' => 0, 'issued_foc' => 0, 'sold' => 0, 'sold_foc' => 0, 'returned' => 0, 'returned_foc' => 0,
            ]);
            $row[$paid] += (int) $item->base_quantity;
            $row[$foc] += (int) $item->foc_base_quantity;
            $rows->put($item->product_id, $row);
        };
        foreach ($transfers->where('status', TransferStatus::Received) as $transfer) {
            foreach ($transfer->items as $item) {
                $add($item, $transfer->direction === 'issue' ? 'issued' : 'returned', $transfer->direction === 'issue' ? 'issued_foc' : 'returned_foc');
            }
        }
        foreach ($sales->where('status', SaleStatus::Posted) as $sale) {
            foreach ($sale->items as $item) {
                $add($item, 'sold', 'sold_foc');
            }
        }

        return $rows->map(function (array $row): array {
            $row['remaining'] = $row['issued'] - $row['sold'] - $row['returned'];
            $row['remaining_foc'] = $row['issued_foc'] - $row['sold_foc'] - $row['returned_foc'];

            return $row;
        })->sortBy('product.name')->values()->all();
    }

    private function financialSummary($sales, $expenses, $submissions, $payments): array
    {
        $posted = $sales->where('status', SaleStatus::Posted);
        $cashSales = (int) $posted->where('payment_type', PaymentType::Cash)->sum('total_amount');
        $creditSales = (int) $posted->where('payment_type', PaymentType::Credit)->sum('total_amount');
        $customerIds = $posted->where('payment_type', PaymentType::Credit)->pluck('customer_id')->unique();
        $postedPayments = $payments->where('status', CustomerPaymentStatus::Posted);
        $registry = app(PaymentMethodRegistry::class);
        $methodTotals = collect($registry->all())->map(function (array $method) use ($posted, $postedPayments): array {
            $salesAmount = (int) $posted->where('payment_type', PaymentType::Cash)->where('payment_method', $method['key'])->sum('total_amount');
            $collectionAmount = (int) $postedPayments->where('payment_method', $method['key'])->sum('amount');

            return $method + ['sales_amount' => $salesAmount, 'collection_amount' => $collectionAmount, 'total_amount' => $salesAmount + $collectionAmount];
        })->filter(fn (array $method) => $method['is_active'] || $method['total_amount'] > 0)->values();

        return [
            'cash_sales' => $cashSales,
            'cash_hold_sales' => (int) $methodTotals->where('adds_to_cash_hold', true)->sum('sales_amount'),
            'credit_sales' => $creditSales,
            'credit_collected' => (int) $postedPayments->sum('amount'),
            'cash_credit_collected' => (int) $methodTotals->where('adds_to_cash_hold', true)->sum('collection_amount'),
            'payment_method_totals' => $methodTotals->all(),
            'latest_credit_balance' => (int) CustomerCreditBalance::query()->whereIn('customer_id', $customerIds)->sum('outstanding_amount'),
            'expenses' => (int) $expenses->sum('amount'),
            'cash_submitted_confirmed' => (int) $submissions->where('status', CashSubmissionStatus::Confirmed)->sum('amount'),
            'cash_submitted_pending' => (int) $submissions->where('status', CashSubmissionStatus::Pending)->sum('amount'),
            'current_cash_hold' => (int) RepresentativeCashBalance::query()->where('sales_representative_id', $this->sales_representative_id)->value('amount'),
        ];
    }

    private function actor($user): ?array
    {
        return $user ? ['id' => $user->id, 'name' => $user->name] : null;
    }
}
