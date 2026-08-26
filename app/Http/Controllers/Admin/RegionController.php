<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Region;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class RegionController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function store(Request $request, Warehouse $warehouse): JsonResponse
    {
        Gate::authorize('update', $warehouse);
        $data = $request->validate($this->rules($warehouse));
        $region = $warehouse->regions()->create($data);
        $this->auditLogger->record($request, 'region.created', $request->user(), $region, ['new' => $region->toArray()]);

        return response()->json(['data' => $this->data($region->load('ways'))], 201);
    }

    public function update(Request $request, Region $region): JsonResponse
    {
        Gate::authorize('update', $region->warehouse);
        $data = $request->validate($this->rules($region->warehouse, $region));
        $old = $region->toArray();
        $region->update($data);
        $this->auditLogger->record($request, 'region.updated', $request->user(), $region, ['old' => $old, 'new' => $region->toArray()]);

        return response()->json(['data' => $this->data($region->load('ways'))]);
    }

    private function rules(Warehouse $warehouse, ?Region $region = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('regions')->where('warehouse_id', $warehouse->id)->ignore($region)],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    private function data(Region $region): array
    {
        return $region->only(['id', 'warehouse_id', 'name', 'notes', 'is_active', 'created_at', 'updated_at']) + [
            'ways' => $region->ways->map->only(['id', 'region_id', 'code', 'name', 'notes', 'is_active'])->values(),
        ];
    }
}
