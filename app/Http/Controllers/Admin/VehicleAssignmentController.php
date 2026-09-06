<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\SalesRepresentative;
use App\Models\Vehicle;
use App\Services\AuditLogger;
use App\Services\VehicleAssignmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class VehicleAssignmentController extends Controller
{
    public function representativeOptions(SalesRepresentative $salesRepresentative)
    {
        Gate::authorize('update', $salesRepresentative);
        return response()->json(['data' => Vehicle::query()->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('sales_representative_id')->orWhere('sales_representative_id', $salesRepresentative->id))
            ->orderBy('vehicle_number')->get(['id', 'vehicle_number as name'])]);
    }

    public function vehicleOptions(Vehicle $vehicle)
    {
        Gate::authorize('update', $vehicle);
        return response()->json(['data' => SalesRepresentative::query()->where('is_active', true)
            ->where(fn ($q) => $q->whereDoesntHave('vehicle')->orWhere('id', $vehicle->sales_representative_id))
            ->orderBy('name')->get(['id', 'name'])]);
    }

    public function representative(Request $request, SalesRepresentative $salesRepresentative, VehicleAssignmentService $assignments, AuditLogger $audit)
    {
        Gate::authorize('update', $salesRepresentative);
        $data = $request->validate(['vehicle_id' => ['present', 'nullable', 'integer', 'exists:vehicles,id']]);
        DB::transaction(function () use ($request, $salesRepresentative, $data, $assignments, $audit): void {
            $old = $salesRepresentative->vehicle?->id;
            $assignments->assign($salesRepresentative, $data['vehicle_id'] ? (int) $data['vehicle_id'] : null);
            $audit->record($request, 'representative.vehicle_assigned', $request->user(), $salesRepresentative, ['old' => ['vehicle_id' => $old], 'new' => $data]);
        });
        return response()->json(['message' => 'Assignment saved.']);
    }

    public function vehicle(Request $request, Vehicle $vehicle, VehicleAssignmentService $assignments, AuditLogger $audit)
    {
        Gate::authorize('update', $vehicle);
        $data = $request->validate(['representative_id' => ['present', 'nullable', 'integer', 'exists:sales_representatives,id']]);
        DB::transaction(function () use ($request, $vehicle, $data, $assignments, $audit): void {
            $old = $vehicle->sales_representative_id;
            $next = $data['representative_id'] ? (int) $data['representative_id'] : null;
            if ($next && Vehicle::query()->where('sales_representative_id', $next)->whereKeyNot($vehicle->id)->exists()) {
                throw \Illuminate\Validation\ValidationException::withMessages(['assignment' => ['This representative already has a vehicle. Remove that assignment first.']]);
            }
            if ($old !== $next) {
                if ($old) $assignments->assign(SalesRepresentative::findOrFail($old), null);
                if ($next) $assignments->assign(SalesRepresentative::findOrFail($next), $vehicle->id);
            }
            $audit->record($request, 'vehicle.representative_assigned', $request->user(), $vehicle, ['old' => ['representative_id' => $old], 'new' => $data]);
        });
        return response()->json(['message' => 'Assignment saved.']);
    }
}
