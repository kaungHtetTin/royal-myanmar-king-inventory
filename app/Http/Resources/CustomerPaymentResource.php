<?php

namespace App\Http\Resources;

use App\Services\PaymentMethodRegistry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CustomerPaymentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'trip' => $this->trip ? $this->trip->only(['id', 'reference', 'title']) : null,
            'representative' => $this->representative ? $this->representative->only(['id', 'code', 'name']) : null,
            'warehouse' => ['id' => $this->warehouse->id, 'code' => $this->warehouse->code, 'name' => $this->warehouse->name],
            'customer' => ['id' => $this->customer->id, 'code' => $this->customer->code, 'name' => $this->customer->name],
            'amount' => $this->amount,
            'payment_date' => $this->payment_date->toDateString(),
            'payment_method' => $this->payment_method,
            'payment_method_name' => app(PaymentMethodRegistry::class)->name($this->payment_method),
            'adds_to_cash_hold' => app(PaymentMethodRegistry::class)->addsToCashHold($this->payment_method),
            'payment_reference' => $this->payment_reference,
            'notes' => $this->notes,
            'status' => $this->status->value,
            'received_by' => $this->actor($this->receiver),
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
