<?php

namespace App\Services;

use App\Models\CustomerCreditBalance;
use App\Models\CustomerCreditTransaction;
use App\Models\InTransitInventory;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeCashTransaction;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Models\WarehouseTransfer;

class RolloutVerificationService
{
    /** @return array<string, array{ok: bool, records: int, mismatches: int}> */
    public function verify(?Warehouse $warehouse = null): array
    {
        return [
            'warehouse_inventory' => $this->warehouseInventory($warehouse),
            'representative_inventory' => $this->representativeInventory($warehouse),
            'in_transit_inventory' => $this->inTransit($warehouse),
            'representative_cash' => $this->representativeCash($warehouse),
            'customer_credit' => $this->customerCredit($warehouse),
            'sale_totals' => $this->saleTotals($warehouse),
        ];
    }

    /** @return array{ok: bool, records: int, mismatches: int} */
    private function warehouseInventory(?Warehouse $warehouse): array
    {
        $rows = WarehouseInventory::query()
            ->when($warehouse, fn ($query) => $query->where('warehouse_id', $warehouse->id))
            ->get();
        $mismatches = $rows->filter(function (WarehouseInventory $balance): bool {
            $in = StockMovement::query()->where('product_id', $balance->product_id)
                ->where('to_location_type', 'warehouse')->where('to_location_id', $balance->warehouse_id)->sum('quantity');
            $out = StockMovement::query()->where('product_id', $balance->product_id)
                ->where('from_location_type', 'warehouse')->where('from_location_id', $balance->warehouse_id)->sum('quantity');

            return $balance->quantity !== (int) $in - (int) $out;
        })->count();

        return $this->result($rows->count(), $mismatches);
    }

    /** @return array{ok: bool, records: int, mismatches: int} */
    private function representativeInventory(?Warehouse $warehouse): array
    {
        $rows = RepresentativeInventory::query()
            ->when($warehouse, fn ($query) => $query->whereHas('representative', fn ($scope) => $scope->where('primary_warehouse_id', $warehouse->id)))
            ->get();
        $mismatches = $rows->filter(function (RepresentativeInventory $balance): bool {
            $in = StockMovement::query()->where('product_id', $balance->product_id)
                ->where('to_location_type', 'representative')->where('to_location_id', $balance->sales_representative_id)->sum('quantity');
            $out = StockMovement::query()->where('product_id', $balance->product_id)
                ->where('from_location_type', 'representative')->where('from_location_id', $balance->sales_representative_id)->sum('quantity');

            return $balance->quantity !== (int) $in - (int) $out;
        })->count();

        return $this->result($rows->count(), $mismatches);
    }

    /** @return array{ok: bool, records: int, mismatches: int} */
    private function inTransit(?Warehouse $warehouse): array
    {
        $rows = InTransitInventory::query()->where('quantity', '>', 0)->get();
        if ($warehouse) {
            $rows = $rows->filter(function (InTransitInventory $balance) use ($warehouse): bool {
                if ($balance->transfer_type === 'warehouse_transfer') {
                    return WarehouseTransfer::query()->whereKey($balance->transfer_id)
                        ->where(fn ($query) => $query->where('source_warehouse_id', $warehouse->id)->orWhere('destination_warehouse_id', $warehouse->id))->exists();
                }

                return RepresentativeTransfer::query()->whereKey($balance->transfer_id)
                    ->where('source_warehouse_id', $warehouse->id)->exists();
            })->values();
        }
        $mismatches = $rows->filter(function (InTransitInventory $balance): bool {
            $model = $balance->transfer_type === 'warehouse_transfer'
                ? WarehouseTransfer::query()->with('items')->find($balance->transfer_id)
                : RepresentativeTransfer::query()->with('items')->find($balance->transfer_id);
            $item = $model?->items->firstWhere('product_id', $balance->product_id);

            return ! $model || $model->status->value !== 'dispatched' || ! $item || $balance->quantity !== $item->quantity;
        })->count();

        return $this->result($rows->count(), $mismatches);
    }

    /** @return array{ok: bool, records: int, mismatches: int} */
    private function representativeCash(?Warehouse $warehouse): array
    {
        $rows = RepresentativeCashBalance::query()
            ->when($warehouse, fn ($query) => $query->whereHas('representative', fn ($scope) => $scope->where('primary_warehouse_id', $warehouse->id)))
            ->get();
        $mismatches = $rows->filter(fn (RepresentativeCashBalance $balance): bool => $balance->amount !== (int) RepresentativeCashTransaction::query()
            ->where('sales_representative_id', $balance->sales_representative_id)->sum('amount_delta'))->count();

        return $this->result($rows->count(), $mismatches);
    }

    /** @return array{ok: bool, records: int, mismatches: int} */
    private function customerCredit(?Warehouse $warehouse): array
    {
        $rows = CustomerCreditBalance::query()
            ->when($warehouse, fn ($query) => $query->whereHas('customer', fn ($scope) => $scope->where('warehouse_id', $warehouse->id)))
            ->get();
        $mismatches = $rows->filter(fn (CustomerCreditBalance $balance): bool => $balance->outstanding_amount !== (int) CustomerCreditTransaction::query()
            ->where('customer_id', $balance->customer_id)->sum('amount_delta'))->count();

        return $this->result($rows->count(), $mismatches);
    }

    /** @return array{ok: bool, records: int, mismatches: int} */
    private function saleTotals(?Warehouse $warehouse): array
    {
        $rows = Sale::query()->with('items')
            ->when($warehouse, fn ($query) => $query->where('warehouse_id', $warehouse->id))
            ->get();
        $mismatches = $rows->filter(fn (Sale $sale): bool => $sale->total_amount !== (int) $sale->items->sum('line_total'))->count();

        return $this->result($rows->count(), $mismatches);
    }

    /** @return array{ok: bool, records: int, mismatches: int} */
    private function result(int $records, int $mismatches): array
    {
        return ['ok' => $mismatches === 0, 'records' => $records, 'mismatches' => $mismatches];
    }
}
