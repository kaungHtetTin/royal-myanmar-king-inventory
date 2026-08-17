<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WarehouseInventoryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'warehouse' => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name],
            'product' => ['id' => $this->product->id, 'sku' => $this->product->sku, 'name' => $this->product->name, 'unit' => $this->product->unit],
            'quantity' => $this->quantity,
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
