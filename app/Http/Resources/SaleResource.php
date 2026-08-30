<?php

namespace App\Http\Resources;

use App\Services\PaymentMethodRegistry;
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
            'trip' => $this->trip_id ? ['id' => $this->trip_id, 'reference' => $this->trip?->reference, 'title' => $this->trip?->title] : null,
            'representative' => ['id' => $this->representative->id, 'code' => $this->representative->code, 'name' => $this->representative->name, 'phone' => $this->representative->phone],
            'warehouse' => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name, 'address' => $this->warehouse->address, 'phone' => $this->warehouse->phone],
            'region' => $this->region ? ['id' => $this->region->id, 'name' => $this->region->name] : null,
            'customer' => ['id' => $this->customer->id, 'code' => $this->customer->code, 'name' => $this->customer->name, 'address' => $this->customer->address, 'phone' => $this->customer->phone],
            'payment_type' => $this->payment_type->value,
            'payment_method' => $this->payment_method,
            'payment_method_name' => $this->payment_method ? app(PaymentMethodRegistry::class)->name($this->payment_method) : null,
            'adds_to_cash_hold' => $this->payment_method ? app(PaymentMethodRegistry::class)->addsToCashHold($this->payment_method) : false,
            'total_amount' => $this->total_amount,
            'promotion_title' => $this->promotion_title,
            'promotion_amount' => $this->promotion_amount,
            'merchandise_subtotal' => $this->total_amount + $this->promotion_amount,
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
                'gross_total' => ($item->quantity * $item->unit_price),
                'discount_percentage' => (float) $item->discount_percentage,
                'discount_amount' => $item->discount_amount,
                'line_total' => $item->line_total,
                'foc_unit' => $item->focUnit ? ['id' => $item->focUnit->id, 'name' => $item->focUnit->name, 'conversion_factor' => $item->focUnit->conversion_factor] : null,
                'foc_quantity' => $item->foc_quantity,
                'foc_base_quantity' => $item->foc_base_quantity,
            ]),
            'total_quantity' => (int) ($this->total_quantity ?? $this->items->sum('quantity')),
            'total_foc_quantity' => (int) $this->items->sum('foc_quantity'),
            'total_discount' => (int) $this->items->sum('discount_amount'),
            'gross_amount' => (int) $this->items->sum(fn ($item) => $item->quantity * $item->unit_price),
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
