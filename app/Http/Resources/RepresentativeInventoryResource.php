<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RepresentativeInventoryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'representative' => ['id' => $this->representative->id, 'code' => $this->representative->code, 'name' => $this->representative->name],
            'product' => ['id' => $this->product->id, 'sku' => $this->product->sku, 'name' => $this->product->name, 'unit' => $this->product->unit],
            'quantity' => $this->quantity,
            'foc_quantity' => $this->foc_quantity,
            'pending_quantity' => (int) ($this->pending_quantity ?? 0),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
