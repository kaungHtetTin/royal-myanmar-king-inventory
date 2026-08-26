<?php

namespace App\Services;

use App\Exceptions\DomainConflictException;
use App\Models\RepresentativeInventory;
use Illuminate\Support\Collection;

class RepresentativeInventoryMutation
{
    /** @param list<int> $productIds
     * @return Collection<int, RepresentativeInventory>
     */
    public function lock(int $representativeId, array $productIds): Collection
    {
        sort($productIds);
        $balances = collect();
        foreach (array_unique($productIds) as $productId) {
            RepresentativeInventory::query()->insertOrIgnore([
                'sales_representative_id' => $representativeId,
                'product_id' => $productId,
                'quantity' => 0,
                'foc_quantity' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $balances->put($productId, RepresentativeInventory::query()
                ->where('sales_representative_id', $representativeId)
                ->where('product_id', $productId)
                ->lockForUpdate()->firstOrFail());
        }

        return $balances;
    }

    public function assertIncomingAllowed(int $representativeId, RepresentativeInventory $balance, int $newQuantity): void
    {
        // Representative capacity is intentionally unlimited. Locking is retained for callers.
    }

    public function increase(RepresentativeInventory $balance, int $quantity): void
    {
        $balance->update(['quantity' => $balance->quantity + $quantity]);
    }

    public function decrease(RepresentativeInventory $balance, int $quantity): void
    {
        if ($balance->quantity < $quantity) {
            throw new DomainConflictException('Insufficient representative stock.', 'INSUFFICIENT_REPRESENTATIVE_STOCK', [
                'available' => $balance->quantity,
                'requested' => $quantity,
                'product_id' => $balance->product_id,
            ]);
        }
        $balance->update(['quantity' => $balance->quantity - $quantity]);
    }

    public function increaseFoc(RepresentativeInventory $balance, int $quantity): void
    {
        $balance->update(['foc_quantity' => $balance->foc_quantity + $quantity]);
    }

    public function decreaseFoc(RepresentativeInventory $balance, int $quantity): void
    {
        if ($balance->foc_quantity < $quantity) {
            throw new DomainConflictException('Insufficient representative FOC stock.', 'INSUFFICIENT_REPRESENTATIVE_FOC_STOCK', [
                'available' => $balance->foc_quantity,
                'requested' => $quantity,
                'product_id' => $balance->product_id,
            ]);
        }
        $balance->update(['foc_quantity' => $balance->foc_quantity - $quantity]);
    }
}
