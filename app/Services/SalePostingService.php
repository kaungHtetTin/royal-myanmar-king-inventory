<?php

namespace App\Services;

use App\Enums\FinancialTransactionType;
use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Enums\StockMovementType;
use App\Exceptions\DomainConflictException;
use App\Models\Customer;
use App\Models\CustomerCreditTransaction;
use App\Models\Product;
use App\Models\RepresentativeCashTransaction;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Http\Request;

class SalePostingService
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly RepresentativeInventoryMutation $inventory,
        private readonly CustomerCreditMutation $credit,
        private readonly RepresentativeCashMutation $cash,
        private readonly AuditLogger $auditLogger,
    ) {}

    /** @return array<string, mixed> */
    public function post(Sale $sale, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "sale:{$sale->id}:post", $key, function () use ($sale, $actor, $request): array {
            $sale = $this->locked($sale);
            $this->requireStatus($sale, SaleStatus::Draft);
            $customer = Customer::query()->lockForUpdate()->findOrFail($sale->customer_id);
            $this->assertPostable($sale, $customer);
            $productIds = $sale->items->pluck('product_id')->all();
            $this->lockProducts($productIds);
            $balances = $this->inventory->lock($sale->sales_representative_id, $productIds);
            foreach ($sale->items as $item) {
                if ($balances->get($item->product_id)->quantity < $item->quantity) {
                    throw new DomainConflictException('Insufficient representative stock.', 'INSUFFICIENT_REPRESENTATIVE_STOCK', [
                        'product_id' => $item->product_id,
                        'available' => $balances->get($item->product_id)->quantity,
                        'requested' => $item->quantity,
                    ]);
                }
            }

            $creditBalance = null;
            $cashBalance = null;
            if ($sale->payment_type === PaymentType::Credit) {
                $creditBalance = $this->credit->lock($customer);
                $this->credit->assertSaleAllowed($customer, $creditBalance, $sale->total_amount);
            } else {
                $cashBalance = $this->cash->lock($sale->sales_representative_id);
            }

            $occurredAt = now();
            foreach ($sale->items as $item) {
                $this->inventory->decrease($balances->get($item->product_id), $item->quantity);
                $this->stockMovement($sale, $item->product_id, $item->quantity, StockMovementType::SaleOut, $actor, $occurredAt);
            }
            if ($creditBalance) {
                $this->credit->increase($creditBalance, $sale->total_amount);
                CustomerCreditTransaction::query()->create($this->financialAttributes($sale, FinancialTransactionType::CreditSale, $sale->total_amount, $actor, $occurredAt) + ['customer_id' => $sale->customer_id]);
            } else {
                $this->cash->increase($cashBalance, $sale->total_amount);
                RepresentativeCashTransaction::query()->create($this->financialAttributes($sale, FinancialTransactionType::CashSale, $sale->total_amount, $actor, $occurredAt) + ['sales_representative_id' => $sale->sales_representative_id]);
            }
            $sale->update(['status' => SaleStatus::Posted, 'posted_by' => $actor->id, 'posted_at' => $occurredAt]);
            $this->auditLogger->record($request, 'sale.posted', $actor, $sale, $this->metadata($sale));

            return $this->result($sale, SaleStatus::Posted);
        });
    }

    /** @return array<string, mixed> */
    public function void(Sale $sale, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "sale:{$sale->id}:void", $key, function () use ($sale, $actor, $reason, $request): array {
            $sale = $this->locked($sale);
            $this->requireStatus($sale, SaleStatus::Posted);
            $customer = Customer::query()->lockForUpdate()->findOrFail($sale->customer_id);
            $productIds = $sale->items->pluck('product_id')->all();
            $balances = $this->inventory->lock($sale->sales_representative_id, $productIds);
            foreach ($sale->items as $item) {
                $this->inventory->assertIncomingAllowed($sale->sales_representative_id, $balances->get($item->product_id), $item->quantity);
            }

            $creditBalance = null;
            $cashBalance = null;
            if ($sale->payment_type === PaymentType::Credit) {
                $creditBalance = $this->credit->lock($customer);
                if ($creditBalance->outstanding_amount < $sale->total_amount) {
                    throw new DomainConflictException('Customer credit has already been settled below the sale amount.', 'INSUFFICIENT_CUSTOMER_CREDIT');
                }
            } else {
                $cashBalance = $this->cash->lock($sale->sales_representative_id);
                if ($cashBalance->amount < $sale->total_amount) {
                    throw new DomainConflictException('Representative cash has already been settled below the sale amount.', 'INSUFFICIENT_REPRESENTATIVE_CASH');
                }
            }

            $occurredAt = now();
            foreach ($sale->items as $item) {
                $this->inventory->increase($balances->get($item->product_id), $item->quantity);
                $this->stockMovement($sale, $item->product_id, $item->quantity, StockMovementType::SaleVoidIn, $actor, $occurredAt, $reason);
            }
            if ($creditBalance) {
                $this->credit->decrease($creditBalance, $sale->total_amount);
                $original = CustomerCreditTransaction::query()->where('source_type', 'sale')->where('source_id', $sale->id)->where('transaction_type', FinancialTransactionType::CreditSale)->lockForUpdate()->firstOrFail();
                CustomerCreditTransaction::query()->create($this->financialAttributes($sale, FinancialTransactionType::CreditSaleVoid, -$sale->total_amount, $actor, $occurredAt, $reason) + ['customer_id' => $sale->customer_id, 'reversal_of_id' => $original->id]);
            } else {
                $this->cash->decrease($cashBalance, $sale->total_amount);
                $original = RepresentativeCashTransaction::query()->where('source_type', 'sale')->where('source_id', $sale->id)->where('transaction_type', FinancialTransactionType::CashSale)->lockForUpdate()->firstOrFail();
                RepresentativeCashTransaction::query()->create($this->financialAttributes($sale, FinancialTransactionType::CashSaleVoid, -$sale->total_amount, $actor, $occurredAt, $reason) + ['sales_representative_id' => $sale->sales_representative_id, 'reversal_of_id' => $original->id]);
            }
            $sale->update(['status' => SaleStatus::Voided, 'voided_by' => $actor->id, 'voided_at' => $occurredAt, 'void_reason' => $reason]);
            $this->auditLogger->record($request, 'sale.voided', $actor, $sale, $this->metadata($sale) + ['reason' => $reason]);

            return $this->result($sale, SaleStatus::Voided);
        });
    }

    private function locked(Sale $sale): Sale
    {
        return Sale::query()->with(['representative', 'warehouse', 'customer', 'items.product'])->lockForUpdate()->findOrFail($sale->id);
    }

    private function requireStatus(Sale $sale, SaleStatus $status): void
    {
        if ($sale->status !== $status) {
            throw new DomainConflictException("Only {$status->value} sales support this command.", 'INVALID_DOCUMENT_STATE', ['current_status' => $sale->status->value]);
        }
    }

    private function assertPostable(Sale $sale, Customer $customer): void
    {
        if ($sale->items->isEmpty()) {
            throw new DomainConflictException('A sale must contain at least one item.', 'EMPTY_SALE');
        }
        if (! $sale->representative->is_active || ! $sale->warehouse->is_active || ! $customer->is_active || $customer->warehouse_id !== $sale->warehouse_id || $sale->items->contains(fn ($item) => ! $item->product->is_active)) {
            throw new DomainConflictException('Inactive or out-of-scope master data cannot be used for sale posting.', 'INACTIVE_MASTER_DATA');
        }
        $calculated = $sale->items->sum(fn ($item) => $item->quantity * $item->unit_price);
        if ($calculated !== $sale->total_amount || $sale->items->contains(fn ($item) => $item->line_total !== $item->quantity * $item->unit_price)) {
            throw new DomainConflictException('Stored sale totals do not reconcile.', 'SALE_TOTAL_MISMATCH');
        }
    }

    /** @param list<int> $productIds */
    private function lockProducts(array $productIds): void
    {
        $products = Product::query()->whereIn('id', $productIds)->orderBy('id')->lockForUpdate()->get();
        if ($products->count() !== count(array_unique($productIds)) || $products->contains(fn (Product $product) => ! $product->is_active)) {
            throw new DomainConflictException('Inactive products cannot be sold.', 'INACTIVE_MASTER_DATA');
        }
    }

    private function stockMovement(Sale $sale, int $productId, int $quantity, StockMovementType $type, User $actor, $occurredAt, ?string $notes = null): void
    {
        StockMovement::query()->create(['product_id' => $productId, 'movement_type' => $type, 'source_type' => 'sale', 'source_id' => $sale->id, 'reference' => $sale->reference, 'from_location_type' => $type === StockMovementType::SaleOut ? 'representative' : 'customer', 'from_location_id' => $type === StockMovementType::SaleOut ? $sale->sales_representative_id : $sale->customer_id, 'to_location_type' => $type === StockMovementType::SaleOut ? 'customer' : 'representative', 'to_location_id' => $type === StockMovementType::SaleOut ? $sale->customer_id : $sale->sales_representative_id, 'quantity' => $quantity, 'created_by' => $actor->id, 'notes' => $notes ?? $sale->notes, 'occurred_at' => $occurredAt]);
    }

    /** @return array<string, mixed> */
    private function financialAttributes(Sale $sale, FinancialTransactionType $type, int $delta, User $actor, $occurredAt, ?string $notes = null): array
    {
        return ['transaction_type' => $type, 'amount_delta' => $delta, 'source_type' => 'sale', 'source_id' => $sale->id, 'reference' => $sale->reference, 'created_by' => $actor->id, 'notes' => $notes ?? $sale->notes, 'occurred_at' => $occurredAt];
    }

    /** @return array<string, mixed> */
    private function metadata(Sale $sale): array
    {
        return ['reference' => $sale->reference, 'sales_representative_id' => $sale->sales_representative_id, 'customer_id' => $sale->customer_id, 'payment_type' => $sale->payment_type->value, 'total_amount' => $sale->total_amount, 'items' => $sale->items->map->only(['product_id', 'quantity', 'unit_price', 'line_total'])->all()];
    }

    /** @return array<string, mixed> */
    private function result(Sale $sale, SaleStatus $status): array
    {
        return ['id' => $sale->id, 'reference' => $sale->reference, 'status' => $status->value, 'total_amount' => $sale->total_amount];
    }
}
