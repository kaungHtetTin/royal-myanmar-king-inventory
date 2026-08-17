<?php

namespace App\Services;

use App\Exceptions\DomainConflictException;
use App\Models\WarehouseInventory;
use Illuminate\Support\Collection;

class WarehouseInventoryMutation
{
    /** @param list<int> $productIds
     * @return Collection<int, WarehouseInventory>
     */
    public function lock(int $warehouseId, array $productIds): Collection
    {
        $balances = collect();
        sort($productIds);
        foreach (array_unique($productIds) as $productId) {
            WarehouseInventory::query()->insertOrIgnore([
                'warehouse_id' => $warehouseId,
                'product_id' => $productId,
                'quantity' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $balance = WarehouseInventory::query()
                ->where('warehouse_id', $warehouseId)->where('product_id', $productId)
                ->lockForUpdate()->firstOrFail();
            $balances->put($productId, $balance);
        }

        return $balances;
    }

    /** @param list<array{warehouse_id: int, product_id: int}> $locations
     * @return Collection<string, WarehouseInventory>
     */
    public function lockMany(array $locations): Collection
    {
        usort($locations, fn (array $left, array $right) => [$left['warehouse_id'], $left['product_id']] <=> [$right['warehouse_id'], $right['product_id']]);
        $balances = collect();
        foreach ($locations as $location) {
            $key = $location['warehouse_id'].':'.$location['product_id'];
            if ($balances->has($key)) {
                continue;
            }
            WarehouseInventory::query()->insertOrIgnore([
                'warehouse_id' => $location['warehouse_id'],
                'product_id' => $location['product_id'],
                'quantity' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $balances->put($key, WarehouseInventory::query()
                ->where('warehouse_id', $location['warehouse_id'])
                ->where('product_id', $location['product_id'])
                ->lockForUpdate()->firstOrFail());
        }

        return $balances;
    }

    public function increase(WarehouseInventory $balance, int $quantity): void
    {
        $balance->update(['quantity' => $balance->quantity + $quantity]);
    }

    public function decrease(WarehouseInventory $balance, int $quantity): void
    {
        if ($balance->quantity < $quantity) {
            throw new DomainConflictException('Insufficient warehouse stock.', 'INSUFFICIENT_WAREHOUSE_STOCK', [
                'available' => $balance->quantity,
                'requested' => $quantity,
                'product_id' => $balance->product_id,
            ]);
        }
        $balance->update(['quantity' => $balance->quantity - $quantity]);
    }
}
