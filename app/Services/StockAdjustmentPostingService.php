<?php

namespace App\Services;

use App\Enums\AdjustmentType;
use App\Enums\InventoryDocumentStatus;
use App\Enums\StockMovementType;
use App\Exceptions\DomainConflictException;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Http\Request;

class StockAdjustmentPostingService
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly WarehouseInventoryMutation $inventory,
        private readonly AuditLogger $auditLogger,
    ) {}

    /** @return array<string, mixed> */
    public function post(StockAdjustment $adjustment, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "stock-adjustment:{$adjustment->id}:post", $key, function () use ($adjustment, $actor, $request): array {
            $adjustment = StockAdjustment::query()->with(['warehouse', 'product'])->lockForUpdate()->findOrFail($adjustment->id);
            if ($adjustment->status !== InventoryDocumentStatus::Draft) {
                throw new DomainConflictException('Only draft stock adjustments can be posted.', 'INVALID_DOCUMENT_STATE', [
                    'current_status' => $adjustment->status->value,
                ]);
            }
            if (! $adjustment->warehouse->is_active || ! $adjustment->product->is_active) {
                throw new DomainConflictException('Inactive warehouses or products cannot be used for posting.', 'INACTIVE_MASTER_DATA');
            }
            $balance = $this->inventory->lock($adjustment->warehouse_id, [$adjustment->product_id])->get($adjustment->product_id);
            $isIncrease = $adjustment->adjustment_type === AdjustmentType::Increase;
            $isIncrease
                ? $this->inventory->increase($balance, $adjustment->quantity)
                : $this->inventory->decrease($balance, $adjustment->quantity);
            $occurredAt = now();
            StockMovement::query()->create([
                'product_id' => $adjustment->product_id,
                'movement_type' => $isIncrease ? StockMovementType::AdjustmentIn : StockMovementType::AdjustmentOut,
                'source_type' => 'stock_adjustment',
                'source_id' => $adjustment->id,
                'reference' => $adjustment->reference,
                'from_location_type' => $isIncrease ? null : 'warehouse',
                'from_location_id' => $isIncrease ? null : $adjustment->warehouse_id,
                'to_location_type' => $isIncrease ? 'warehouse' : null,
                'to_location_id' => $isIncrease ? $adjustment->warehouse_id : null,
                'quantity' => $adjustment->quantity,
                'created_by' => $actor->id,
                'notes' => $adjustment->reason,
                'occurred_at' => $occurredAt,
            ]);
            $adjustment->update([
                'status' => InventoryDocumentStatus::Posted,
                'posted_by' => $actor->id,
                'posted_at' => $occurredAt,
            ]);
            $this->auditLogger->record($request, 'stock_adjustment.posted', $actor, $adjustment, [
                'reference' => $adjustment->reference,
                'warehouse_id' => $adjustment->warehouse_id,
                'product_id' => $adjustment->product_id,
                'type' => $adjustment->adjustment_type->value,
                'quantity' => $adjustment->quantity,
                'reason' => $adjustment->reason,
            ]);

            return ['id' => $adjustment->id, 'reference' => $adjustment->reference, 'status' => InventoryDocumentStatus::Posted->value];
        });
    }
}
