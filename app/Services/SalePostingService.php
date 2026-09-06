<?php

namespace App\Services;

use App\Enums\FinancialTransactionType;
use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Enums\StockMovementType;
use App\Enums\TripStatus;
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
        private readonly PaymentMethodRegistry $paymentMethods,
    ) {}

    /** @return array<string, mixed> */
    public function post(Sale $sale, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "sale:{$sale->id}:post", $key, function () use ($sale, $actor, $request): array {
            $sale = $this->locked($sale);
            $this->requireStatus($sale, SaleStatus::Draft);
            if (! $sale->trip || $sale->trip->status !== TripStatus::Operation) {
                throw new DomainConflictException('Sales can only be posted during trip operation.', 'INVALID_TRIP_STATE');
            }
            $customer = Customer::query()->lockForUpdate()->findOrFail($sale->customer_id);
            $this->assertPostable($sale, $customer);
            $productIds = $sale->items->pluck('product_id')->all();
            $this->lockProducts($productIds);
            $balances = $this->inventory->lock($sale->sales_representative_id, $productIds);
            foreach ($sale->items as $item) {
                if ($balances->get($item->product_id)->quantity < $item->base_quantity) {
                    throw new DomainConflictException('Insufficient representative stock.', 'INSUFFICIENT_REPRESENTATIVE_STOCK', [
                        'product_id' => $item->product_id,
                        'available' => $balances->get($item->product_id)->quantity,
                        'requested' => $item->base_quantity,
                    ]);
                }
                if ($balances->get($item->product_id)->foc_quantity < $item->foc_base_quantity) {
                    throw new DomainConflictException('Insufficient representative FOC stock.', 'INSUFFICIENT_REPRESENTATIVE_FOC_STOCK', ['product_id' => $item->product_id, 'available' => $balances->get($item->product_id)->foc_quantity, 'requested' => $item->foc_base_quantity]);
                }
            }

            $creditBalance = null;
            $cashBalance = null;
            if ($sale->payment_type === PaymentType::Credit) {
                $creditBalance = $this->credit->lock($customer);
                $this->credit->assertSaleAllowed($customer, $creditBalance, $sale->total_amount);
            } elseif ($this->paymentMethods->addsToCashHold($sale->payment_method)) {
                $cashBalance = $this->cash->lock($sale->sales_representative_id);
            }

            $occurredAt = now();
            foreach ($sale->items as $item) {
                $this->inventory->decrease($balances->get($item->product_id), $item->base_quantity);
                $this->stockMovement($sale, $item->product_id, $item->base_quantity, StockMovementType::SaleOut, $actor, $occurredAt);
                if ($item->foc_base_quantity > 0) {
                    $this->inventory->decreaseFoc($balances->get($item->product_id), $item->foc_base_quantity);
                    $this->stockMovement($sale, $item->product_id, $item->foc_base_quantity, StockMovementType::SaleFocOut, $actor, $occurredAt);
                }
            }
            if ($creditBalance) {
                $this->credit->increase($creditBalance, $sale->total_amount);
                CustomerCreditTransaction::query()->create($this->financialAttributes($sale, FinancialTransactionType::CreditSale, $sale->total_amount, $actor, $occurredAt) + ['customer_id' => $sale->customer_id]);
            } elseif ($cashBalance) {
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
                $this->inventory->assertIncomingAllowed($sale->sales_representative_id, $balances->get($item->product_id), $item->base_quantity + $item->foc_base_quantity);
            }

            $creditBalance = null;
            $cashBalance = null;
            if ($sale->payment_type === PaymentType::Credit) {
                $creditBalance = $this->credit->lock($customer);
                if ($creditBalance->outstanding_amount < $sale->total_amount) {
                    throw new DomainConflictException('Customer credit has already been settled below the sale amount.', 'INSUFFICIENT_CUSTOMER_CREDIT');
                }
            } elseif ($this->paymentMethods->addsToCashHold($sale->payment_method)) {
                $cashBalance = $this->cash->lock($sale->sales_representative_id);
                if ($cashBalance->amount < $sale->total_amount) {
                    throw new DomainConflictException('Representative cash has already been settled below the sale amount.', 'INSUFFICIENT_REPRESENTATIVE_CASH');
                }
            }

            $occurredAt = now();
            foreach ($sale->items as $item) {
                $this->inventory->increase($balances->get($item->product_id), $item->base_quantity);
                $this->stockMovement($sale, $item->product_id, $item->base_quantity, StockMovementType::SaleVoidIn, $actor, $occurredAt, $reason);
                if ($item->foc_base_quantity > 0) {
                    $this->inventory->increaseFoc($balances->get($item->product_id), $item->foc_base_quantity);
                    $this->stockMovement($sale, $item->product_id, $item->foc_base_quantity, StockMovementType::SaleFocVoidIn, $actor, $occurredAt, $reason);
                }
            }
            if ($creditBalance) {
                $this->credit->decrease($creditBalance, $sale->total_amount);
                $original = CustomerCreditTransaction::query()->where('source_type', 'sale')->where('source_id', $sale->id)->where('transaction_type', FinancialTransactionType::CreditSale)->lockForUpdate()->firstOrFail();
                CustomerCreditTransaction::query()->create($this->financialAttributes($sale, FinancialTransactionType::CreditSaleVoid, -$sale->total_amount, $actor, $occurredAt, $reason) + ['customer_id' => $sale->customer_id, 'reversal_of_id' => $original->id]);
            } elseif ($cashBalance) {
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
        return Sale::query()->with(['trip', 'representative.regions', 'warehouse', 'region', 'customer.assignedRegion', 'items.product', 'items.unit', 'items.focUnit'])->lockForUpdate()->findOrFail($sale->id);
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
        if (! $sale->representative->is_active || ! $sale->warehouse->is_active || ! $sale->region?->is_active || ! $customer->is_active || $customer->region_id !== $sale->region_id || $customer->assignedRegion?->warehouse_id !== $sale->warehouse_id || ! $sale->representative->regions->contains('id', $sale->region_id) || $sale->items->contains(fn ($item) => ! $item->product->is_active || ! $item->unit?->is_active || ($item->foc_quantity > 0 && ! $item->focUnit?->is_active))) {
            throw new DomainConflictException('Inactive or out-of-scope master data cannot be used for sale posting.', 'INACTIVE_MASTER_DATA');
        }
        $calculated = $sale->items->sum('line_total') - $sale->promotion_amount;
        if ($calculated !== $sale->total_amount || $sale->items->contains(function ($item): bool {
            $gross = $item->quantity * $item->unit_price;
            $discount = (int) round($gross * (float) $item->discount_percentage / 100);

            return $item->discount_amount !== $discount || $item->cashback_amount < 0 || $item->promotion_amount < 0 || $item->line_total < 0 || $item->line_total !== $gross - $discount - $item->cashback_amount - $item->promotion_amount;
        })) {
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
        $out = in_array($type, [StockMovementType::SaleOut, StockMovementType::SaleFocOut], true);
        StockMovement::query()->create(['product_id' => $productId, 'movement_type' => $type, 'source_type' => 'sale', 'source_id' => $sale->id, 'reference' => $sale->reference, 'from_location_type' => $out ? 'representative' : 'customer', 'from_location_id' => $out ? $sale->sales_representative_id : $sale->customer_id, 'to_location_type' => $out ? 'customer' : 'representative', 'to_location_id' => $out ? $sale->customer_id : $sale->sales_representative_id, 'quantity' => $quantity, 'created_by' => $actor->id, 'notes' => $notes ?? $sale->notes, 'occurred_at' => $occurredAt]);
    }

    /** @return array<string, mixed> */
    private function financialAttributes(Sale $sale, FinancialTransactionType $type, int $delta, User $actor, $occurredAt, ?string $notes = null): array
    {
        return ['transaction_type' => $type, 'amount_delta' => $delta, 'source_type' => 'sale', 'source_id' => $sale->id, 'reference' => $sale->reference, 'created_by' => $actor->id, 'notes' => $notes ?? $sale->notes, 'occurred_at' => $occurredAt];
    }

    /** @return array<string, mixed> */
    private function metadata(Sale $sale): array
    {
        return ['reference' => $sale->reference, 'sales_representative_id' => $sale->sales_representative_id, 'region_id' => $sale->region_id, 'customer_id' => $sale->customer_id, 'payment_type' => $sale->payment_type->value, 'payment_method' => $sale->payment_method, 'total_amount' => $sale->total_amount, 'promotion_title' => $sale->promotion_title, 'promotion_amount' => $sale->promotion_amount, 'items' => $sale->items->map->only(['product_id', 'product_unit_id', 'quantity', 'base_quantity', 'unit_price', 'discount_percentage', 'discount_amount', 'cashback_amount', 'promotion_title', 'promotion_amount', 'line_total', 'foc_product_unit_id', 'foc_quantity', 'foc_base_quantity'])->all()];
    }

    /** @return array<string, mixed> */
    private function result(Sale $sale, SaleStatus $status): array
    {
        return ['id' => $sale->id, 'reference' => $sale->reference, 'status' => $status->value, 'total_amount' => $sale->total_amount];
    }
}
