<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WarehouseResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'address' => $this->address,
            'phone' => $this->phone,
            'notes' => $this->notes,
            'is_active' => $this->is_active,
            'users_count' => $this->whenCounted('users'),
            'regions' => $this->whenLoaded('regions', fn () => $this->regions->map(fn ($region) => [
                'id' => $region->id,
                'warehouse_id' => $region->warehouse_id,
                'name' => $region->name,
                'notes' => $region->notes,
                'is_active' => $region->is_active,
                'ways' => $region->ways->map(fn ($way) => [
                    'id' => $way->id,
                    'region_id' => $way->region_id,
                    'code' => $way->code,
                    'name' => $way->name,
                    'notes' => $way->notes,
                    'is_active' => $way->is_active,
                ])->values(),
            ])->values()),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
