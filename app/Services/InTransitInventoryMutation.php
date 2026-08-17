<?php

namespace App\Services;

use App\Exceptions\DomainConflictException;
use App\Models\InTransitInventory;
use Illuminate\Support\Collection;

class InTransitInventoryMutation
{
    /** @param list<int> $productIds
     * @return Collection<int, InTransitInventory>
     */
    public function lock(string $transferType, int $transferId, array $productIds): Collection
    {
        sort($productIds);
        $balances = collect();
        foreach (array_unique($productIds) as $productId) {
            InTransitInventory::query()->insertOrIgnore([
                'transfer_type' => $transferType,
                'transfer_id' => $transferId,
                'product_id' => $productId,
                'quantity' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $balances->put($productId, InTransitInventory::query()
                ->where('transfer_type', $transferType)
                ->where('transfer_id', $transferId)
                ->where('product_id', $productId)
                ->lockForUpdate()->firstOrFail());
        }

        return $balances;
    }

    public function increase(InTransitInventory $balance, int $quantity): void
    {
        $balance->update(['quantity' => $balance->quantity + $quantity]);
    }

    public function decrease(InTransitInventory $balance, int $quantity): void
    {
        if ($balance->quantity < $quantity) {
            throw new DomainConflictException('The in-transit position does not contain the requested quantity.', 'INSUFFICIENT_IN_TRANSIT_STOCK');
        }
        $balance->update(['quantity' => $balance->quantity - $quantity]);
    }
}
