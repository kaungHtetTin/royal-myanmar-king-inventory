<?php

namespace App\Services;

use App\Exceptions\DomainConflictException;
use App\Models\InTransitInventory;
use App\Models\RepresentativeInventory;
use Illuminate\Support\Collection;

class RepresentativeInventoryMutation
{
    public const MAX_QUANTITY = 100;

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
        $pending = (int) InTransitInventory::query()
            ->join('representative_transfers', function ($join): void {
                $join->on('representative_transfers.id', '=', 'in_transit_inventories.transfer_id')
                    ->where('in_transit_inventories.transfer_type', '=', 'representative_transfer');
            })
            ->where('representative_transfers.sales_representative_id', $representativeId)
            ->where('representative_transfers.status', 'dispatched')
            ->where('transfer_type', 'representative_transfer')
            ->where('in_transit_inventories.product_id', $balance->product_id)
            ->lockForUpdate()
            ->get(['in_transit_inventories.quantity'])
            ->sum('quantity');
        $projected = $balance->quantity + $pending + $newQuantity;
        if ($projected > self::MAX_QUANTITY) {
            throw new DomainConflictException('Representative product holding would exceed 100 units.', 'REPRESENTATIVE_STOCK_LIMIT_EXCEEDED', [
                'current' => $balance->quantity,
                'pending' => $pending,
                'requested' => $newQuantity,
                'projected' => $projected,
                'limit' => self::MAX_QUANTITY,
                'product_id' => $balance->product_id,
            ]);
        }
    }

    public function increase(RepresentativeInventory $balance, int $quantity): void
    {
        if ($balance->quantity + $quantity > self::MAX_QUANTITY) {
            throw new DomainConflictException('Representative product holding would exceed 100 units.', 'REPRESENTATIVE_STOCK_LIMIT_EXCEEDED');
        }
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
}
