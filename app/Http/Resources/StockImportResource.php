<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StockImportResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'warehouse' => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name],
            'status' => $this->status->value,
            'notes' => $this->notes,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'product' => ['id' => $item->product->id, 'sku' => $item->product->sku, 'name' => $item->product->name, 'unit' => $item->product->unit],
                'quantity' => $item->quantity,
            ])),
            'total_quantity' => (int) ($this->total_quantity ?? $this->items->sum('quantity')),
            'created_by' => ['id' => $this->creator->id, 'name' => $this->creator->name],
            'posted_by' => $this->poster ? ['id' => $this->poster->id, 'name' => $this->poster->name] : null,
            'posted_at' => $this->posted_at?->toISOString(),
            'voided_by' => $this->voider ? ['id' => $this->voider->id, 'name' => $this->voider->name] : null,
            'voided_at' => $this->voided_at?->toISOString(),
            'void_reason' => $this->void_reason,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
