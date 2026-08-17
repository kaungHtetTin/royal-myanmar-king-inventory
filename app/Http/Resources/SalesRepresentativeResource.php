<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SalesRepresentativeResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'phone' => $this->phone,
            'email' => $this->email,
            'region' => $this->region,
            'notes' => $this->notes,
            'is_active' => $this->is_active,
            'primary_warehouse_id' => $this->primary_warehouse_id,
            'primary_warehouse' => $this->whenLoaded('primaryWarehouse', fn () => [
                'id' => $this->primaryWarehouse->id,
                'code' => $this->primaryWarehouse->code,
                'name' => $this->primaryWarehouse->name,
            ]),
            'account' => $this->whenLoaded('user', fn () => [
                'id' => $this->user->id,
                'username' => $this->user->username,
                'email' => $this->user->email,
                'is_active' => $this->user->is_active,
                'last_login_at' => $this->user->last_login_at?->toISOString(),
            ]),
            'vehicle' => $this->whenLoaded('vehicle', fn () => $this->vehicle ? [
                'id' => $this->vehicle->id,
                'vehicle_number' => $this->vehicle->vehicle_number,
                'vehicle_type' => $this->vehicle->vehicle_type,
            ] : null),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
