<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RepresentativeTransferResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $transit = $this->relationLoaded('transit') ? $this->transit->keyBy('product_id') : collect();

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'trip' => $this->trip_id ? ['id' => $this->trip_id, 'reference' => $this->trip?->reference, 'title' => $this->trip?->title] : null,
            'direction' => $this->direction,
            'source_warehouse' => ['id' => $this->sourceWarehouse->id, 'code' => $this->sourceWarehouse->code, 'name' => $this->sourceWarehouse->name],
            'representative' => ['id' => $this->representative->id, 'code' => $this->representative->code, 'name' => $this->representative->name],
            'status' => $this->status->value,
            'notes' => $this->notes,
            'items' => $this->items->map(fn ($item) => [
                'id' => $item->id,
                'product' => ['id' => $item->product->id, 'sku' => $item->product->sku, 'name' => $item->product->name, 'unit' => $item->product->unit],
                'unit' => $item->unit ? ['id' => $item->unit->id, 'name' => $item->unit->name, 'conversion_factor' => $item->unit->conversion_factor] : null,
                'quantity' => $item->quantity,
                'base_quantity' => $item->base_quantity,
                'foc_unit' => $item->focUnit ? ['id' => $item->focUnit->id, 'name' => $item->focUnit->name, 'conversion_factor' => $item->focUnit->conversion_factor] : null,
                'foc_quantity' => $item->foc_quantity,
                'foc_base_quantity' => $item->foc_base_quantity,
                'in_transit_quantity' => (int) ($transit->get($item->product_id)?->quantity ?? 0),
            ]),
            'total_quantity' => (int) ($this->total_quantity ?? $this->items->sum('quantity')),
            'total_base_quantity' => (int) $this->items->sum(fn ($item) => $item->base_quantity + $item->foc_base_quantity),
            'total_foc_base_quantity' => (int) $this->items->sum('foc_base_quantity'),
            'created_by' => $this->actor($this->creator),
            'dispatched_by' => $this->actor($this->dispatcher),
            'dispatched_at' => $this->dispatched_at?->toISOString(),
            'received_by' => $this->actor($this->receiver),
            'received_at' => $this->received_at?->toISOString(),
            'cancelled_by' => $this->actor($this->canceller),
            'cancelled_at' => $this->cancelled_at?->toISOString(),
            'cancel_reason' => $this->cancel_reason,
            'reversed_by' => $this->actor($this->reverser),
            'reversed_at' => $this->reversed_at?->toISOString(),
            'reversal_reason' => $this->reversal_reason,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function actor($user): ?array
    {
        return $user ? ['id' => $user->id, 'name' => $user->name] : null;
    }
}
