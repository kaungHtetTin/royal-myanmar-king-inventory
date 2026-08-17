<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RepresentativeCashBalanceResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $hold = (int) ($this->cashBalance?->amount ?? 0);
        $pending = (int) ($this->pending_submissions ?? 0);

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'warehouse' => ['id' => $this->primaryWarehouse->id, 'code' => $this->primaryWarehouse->code, 'name' => $this->primaryWarehouse->name],
            'cash_hold' => $hold,
            'pending_submissions' => $pending,
            'available_to_submit' => max(0, $hold - $pending),
        ];
    }
}
