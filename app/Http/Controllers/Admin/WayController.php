<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Region;
use App\Models\Way;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class WayController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger, private readonly DocumentReferenceGenerator $references) {}

    public function store(Request $request, Region $region): JsonResponse
    {
        Gate::authorize('update', $region->warehouse);
        $data = $request->validate($this->rules($region));
        do {
            $data['code'] = $this->references->next('way', 'WAY');
        } while (Way::query()->where('code', $data['code'])->exists());
        $way = $region->ways()->create($data);
        $this->auditLogger->record($request, 'way.created', $request->user(), $way, ['new' => $way->toArray()]);

        return response()->json(['data' => $way], 201);
    }

    public function update(Request $request, Way $way): JsonResponse
    {
        Gate::authorize('update', $way->region->warehouse);
        $data = $request->validate($this->rules($way->region, $way));
        $old = $way->toArray();
        $way->update($data);
        $this->auditLogger->record($request, 'way.updated', $request->user(), $way, ['old' => $old, 'new' => $way->toArray()]);

        return response()->json(['data' => $way]);
    }

    private function rules(Region $region, ?Way $way = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100', Rule::unique('ways')->where('region_id', $region->id)->ignore($way)],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['required', 'boolean'],
        ];
    }
}
