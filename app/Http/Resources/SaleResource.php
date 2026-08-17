<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'representative' => ['id' => $this->representative->id, 'code' => $this->representative->code, 'name' => $this->representative->name],
            'warehouse' => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name],
            'customer' => ['id' => $this->customer->id, 'code' => $this->customer->code, 'name' => $this->customer->name],
            'payment_type' => $this->payment_type->value,
            'total_amount' => $this->total_amount,
            'status' => $this->status->value,
            'notes' => $this->notes,
            'items' => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'product' => ['id' => $item->product->id, 'sku' => $item->product->sku, 'name' => $item->product->name, 'unit' => $item->product->unit],
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'line_total' => $item->line_total,
            ]),
            'total_quantity' => (int) ($this->total_quantity ?? $this->items->sum('quantity')),
            'created_by' => $this->actor($this->creator),
            'posted_by' => $this->actor($this->poster),
            'posted_at' => $this->posted_at?->toISOString(),
            'voided_by' => $this->actor($this->voider),
            'voided_at' => $this->voided_at?->toISOString(),
            'void_reason' => $this->void_reason,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function actor($user): ?array
    {
        return $user ? ['id' => $user->id, 'name' => $user->name] : null;
    }
}
