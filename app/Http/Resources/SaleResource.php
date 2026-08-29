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
            'representative' => ['id' => $this->representative->id, 'code' => $this->representative->code, 'name' => $this->representative->name, 'phone' => $this->representative->phone],
            'warehouse' => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name, 'address' => $this->warehouse->address, 'phone' => $this->warehouse->phone],
            'region' => $this->region ? ['id' => $this->region->id, 'name' => $this->region->name] : null,
            'way' => $this->way ? ['id' => $this->way->id, 'code' => $this->way->code, 'name' => $this->way->name] : null,
            'customer' => ['id' => $this->customer->id, 'code' => $this->customer->code, 'name' => $this->customer->name, 'address' => $this->customer->address, 'phone' => $this->customer->phone],
            'payment_type' => $this->payment_type->value,
            'total_amount' => $this->total_amount,
            'status' => $this->status->value,
            'notes' => $this->notes,
            'creation_location' => $this->creation_latitude !== null && $this->creation_longitude !== null ? [
                'latitude' => $this->creation_latitude,
                'longitude' => $this->creation_longitude,
                'accuracy_meters' => $this->location_accuracy_meters,
                'captured_at' => $this->location_captured_at?->toISOString(),
            ] : null,
            'items' => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'product' => ['id' => $item->product->id, 'sku' => $item->product->sku, 'name' => $item->product->name, 'unit' => $item->product->unit],
                'unit' => $item->unit ? ['id' => $item->unit->id, 'name' => $item->unit->name, 'conversion_factor' => $item->unit->conversion_factor] : null,
                'quantity' => $item->quantity,
                'base_quantity' => $item->base_quantity,
                'unit_price' => $item->unit_price,
                'line_total' => $item->line_total,
                'foc_unit' => $item->focUnit ? ['id' => $item->focUnit->id, 'name' => $item->focUnit->name, 'conversion_factor' => $item->focUnit->conversion_factor] : null,
                'foc_quantity' => $item->foc_quantity,
                'foc_base_quantity' => $item->foc_base_quantity,
            ]),
            'total_quantity' => (int) ($this->total_quantity ?? $this->items->sum('quantity')),
            'total_foc_quantity' => (int) $this->items->sum('foc_quantity'),
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
