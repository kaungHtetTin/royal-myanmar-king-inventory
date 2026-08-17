<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockAdjustmentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'warehouse' => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name],
            'product' => ['id' => $this->product->id, 'sku' => $this->product->sku, 'name' => $this->product->name, 'unit' => $this->product->unit],
            'adjustment_type' => $this->adjustment_type->value,
            'quantity' => $this->quantity,
            'reason' => $this->reason,
            'notes' => $this->notes,
            'status' => $this->status->value,
            'created_by' => ['id' => $this->creator->id, 'name' => $this->creator->name],
            'posted_by' => $this->poster ? ['id' => $this->poster->id, 'name' => $this->poster->name] : null,
            'posted_at' => $this->posted_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
