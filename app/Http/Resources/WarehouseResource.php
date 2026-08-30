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
            'sales_representatives_count' => $this->whenCounted('salesRepresentatives'),
            'customers_count' => $this->whenCounted('customers'),
            'active_trips_count' => $this->whenCounted('active_trips'),
            'regions' => $this->whenLoaded('regions', fn () => $this->regions->map(fn ($region) => [
                'id' => $region->id,
                'warehouse_id' => $region->warehouse_id,
                'name' => $region->name,
                'notes' => $region->notes,
                'is_active' => $region->is_active,
                'representatives_count' => $region->representatives_count ?? null,
                'active_representatives_count' => $region->active_representatives_count ?? null,
                'customers_count' => $region->customers_count ?? null,
                'active_customers_count' => $region->active_customers_count ?? null,
                'active_trips_count' => $region->active_trips_count ?? null,
            ])->values()),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
