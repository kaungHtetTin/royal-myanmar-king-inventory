<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VehicleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'vehicle_number' => $this->vehicle_number,
            'vehicle_type' => $this->vehicle_type,
            'brand' => $this->brand,
            'model' => $this->model,
            'sales_representative_id' => $this->sales_representative_id,
            'representative' => $this->whenLoaded('representative', fn () => $this->representative ? [
                'id' => $this->representative->id,
                'code' => $this->representative->code,
                'name' => $this->representative->name,
            ] : null),
            'is_active' => $this->is_active,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
