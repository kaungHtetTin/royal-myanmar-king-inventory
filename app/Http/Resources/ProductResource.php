<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'category' => $this->category,
            'unit' => $this->unit,
            'selling_price' => $this->selling_price,
            'barcode' => $this->barcode,
            'description' => $this->description,
            'is_active' => $this->is_active,
            'units' => $this->whenLoaded('units', fn () => $this->units->map(fn ($unit) => [
                'id' => $unit->id,
                'name' => $unit->name,
                'conversion_factor' => $unit->conversion_factor,
                'barcode' => $unit->barcode,
                'is_base' => $unit->is_base,
                'is_default_selling' => $unit->is_default_selling,
                'is_active' => $unit->is_active,
                'prices' => $unit->relationLoaded('regionPrices') ? $unit->regionPrices->map(fn ($price) => [
                    'region_id' => $price->region_id,
                    'price' => $price->price,
                ])->values() : [],
            ])->values()),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
