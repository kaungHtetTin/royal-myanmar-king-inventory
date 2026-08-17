<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockMovementResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'movement_type' => $this->movement_type->value,
            'product' => ['id' => $this->product->id, 'sku' => $this->product->sku, 'name' => $this->product->name, 'unit' => $this->product->unit],
            'quantity' => $this->quantity,
            'source' => ['type' => $this->source_type, 'id' => $this->source_id],
            'from' => ['type' => $this->from_location_type, 'id' => $this->from_location_id],
            'to' => ['type' => $this->to_location_type, 'id' => $this->to_location_id],
            'actor' => ['id' => $this->actor->id, 'name' => $this->actor->name],
            'notes' => $this->notes,
            'occurred_at' => $this->occurred_at?->toISOString(),
        ];
    }
}
