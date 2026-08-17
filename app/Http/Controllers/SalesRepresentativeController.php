<?php

namespace App\Http\Controllers;

use App\Models\SalesRepresentative;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class SalesRepresentativeController extends Controller
{
    public function current(Request $request): JsonResponse
    {
        $representative = $request->user()->salesRepresentative()->with('primaryWarehouse:id,code,name')->firstOrFail();
        Gate::authorize('view', $representative);

        return response()->json(['representative' => $this->payload($representative)]);
    }

    public function show(SalesRepresentative $salesRepresentative): JsonResponse
    {
        Gate::authorize('view', $salesRepresentative);
        $salesRepresentative->loadMissing('primaryWarehouse:id,code,name');

        return response()->json(['representative' => $this->payload($salesRepresentative)]);
    }

    /** @return array<string, mixed> */
    private function payload(SalesRepresentative $representative): array
    {
        return [
            'id' => $representative->id,
            'code' => $representative->code,
            'name' => $representative->name,
            'phone' => $representative->phone,
            'email' => $representative->email,
            'region' => $representative->region,
            'is_active' => $representative->is_active,
            'primary_warehouse' => $representative->primaryWarehouse,
        ];
    }
}
