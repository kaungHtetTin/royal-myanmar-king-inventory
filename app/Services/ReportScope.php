<?php

namespace App\Services;

use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class ReportScope
{
    public function __construct(private readonly WarehouseAccess $warehouses) {}

    /** @return Collection<int, int> */
    public function warehouseIds(User $user, ?int $selected = null): Collection
    {
        $ids = $this->warehouses->scope(Warehouse::query(), $user)->pluck('id')->map(fn ($id) => (int) $id);
        if ($selected !== null && ! $ids->contains($selected)) {
            abort(403);
        }

        return $selected === null ? $ids : collect([$selected]);
    }

    /** @param Builder<StockMovement> $query
     * @param  Collection<int, int>  $warehouseIds
     */
    public function movements(Builder $query, Collection $warehouseIds): Builder
    {
        $representativeIds = SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->pluck('id');

        return $query->where(function (Builder $scope) use ($warehouseIds, $representativeIds): void {
            $scope->where(fn (Builder $location) => $location->where('from_location_type', 'warehouse')->whereIn('from_location_id', $warehouseIds))
                ->orWhere(fn (Builder $location) => $location->where('to_location_type', 'warehouse')->whereIn('to_location_id', $warehouseIds))
                ->orWhere(fn (Builder $location) => $location->where('from_location_type', 'representative')->whereIn('from_location_id', $representativeIds))
                ->orWhere(fn (Builder $location) => $location->where('to_location_type', 'representative')->whereIn('to_location_id', $representativeIds));
        });
    }
}
