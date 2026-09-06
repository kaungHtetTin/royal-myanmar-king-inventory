<?php

namespace App\Services;

use App\Models\SalesRepresentative;
use App\Models\Trip;
use App\Models\Vehicle;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VehicleAssignmentService
{
    public function assign(SalesRepresentative $representative, ?int $vehicleId): void
    {
        DB::transaction(function () use ($representative, $vehicleId): void {
            $representative = SalesRepresentative::query()->lockForUpdate()->findOrFail($representative->id);
            $vehicles = Vehicle::query()->where('sales_representative_id', $representative->id)
                ->when($vehicleId, fn ($query) => $query->orWhere('id', $vehicleId))->orderBy('id')->lockForUpdate()->get();
            $current = $vehicles->firstWhere('sales_representative_id', $representative->id);
            if ($current?->id === $vehicleId) {
                return;
            }
            $vehicle = $vehicleId ? $vehicles->firstWhere('id', $vehicleId) : null;
            if ($vehicleId && (! $vehicle || ! $vehicle->is_active || ! $representative->is_active || ($vehicle->sales_representative_id && $vehicle->sales_representative_id !== $representative->id))) {
                throw ValidationException::withMessages(['assignment' => ['Choose an active, unassigned vehicle and representative.']]);
            }
            if (Trip::query()->whereIn('status', ['planning', 'operation', 'ending'])
                ->where(fn ($query) => $query->where('sales_representative_id', $representative->id)->orWhereIn('vehicle_id', $vehicles->pluck('id')))->exists()) {
                throw ValidationException::withMessages(['assignment' => ['Complete or cancel the active trip before changing its vehicle assignment.']]);
            }
            $current?->update(['sales_representative_id' => null]);
            $vehicle?->update(['sales_representative_id' => $representative->id]);
        });
    }
}
