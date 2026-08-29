<?php

namespace App\Services;

use App\Enums\StockMovementType;
use App\Enums\TransferStatus;
use App\Exceptions\DomainConflictException;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\WarehouseTransfer;
use Illuminate\Http\Request;

class WarehouseTransferPostingService
{
    private const TRANSIT_TYPE = 'warehouse_transfer';

    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly WarehouseInventoryMutation $warehouses,
        private readonly InTransitInventoryMutation $inTransit,
        private readonly AuditLogger $auditLogger,
    ) {}

    /** @return array<string, mixed> */
    public function dispatch(WarehouseTransfer $transfer, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "warehouse-transfer:{$transfer->id}:dispatch", $key, function () use ($transfer, $actor, $request): array {
            $transfer = $this->locked($transfer);
            $this->requireStatus($transfer, TransferStatus::Draft);
            $this->assertPostable($transfer);
            $warehouseBalances = $this->warehouses->lock($transfer->source_warehouse_id, $transfer->items->pluck('product_id')->all());
            $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $transfer->items->pluck('product_id')->all());
            $occurredAt = now();
            foreach ($transfer->items as $item) {
                $this->warehouses->decrease($warehouseBalances->get($item->product_id), $item->base_quantity);
                $this->inTransit->increase($transitBalances->get($item->product_id), $item->base_quantity);
                $this->movement($transfer, $item->product_id, $item->base_quantity, StockMovementType::WarehouseTransferDispatch, 'warehouse', $transfer->source_warehouse_id, 'in_transit', $transfer->id, $actor, $occurredAt);
            }
            $transfer->update(['status' => TransferStatus::Dispatched, 'dispatched_by' => $actor->id, 'dispatched_at' => $occurredAt]);
            $this->auditLogger->record($request, 'warehouse_transfer.dispatched', $actor, $transfer, $this->metadata($transfer));

            return $this->result($transfer, TransferStatus::Dispatched);
        });
    }

    /** @return array<string, mixed> */
    public function receive(WarehouseTransfer $transfer, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "warehouse-transfer:{$transfer->id}:receive", $key, function () use ($transfer, $actor, $request): array {
            $transfer = $this->locked($transfer);
            $this->requireStatus($transfer, TransferStatus::Dispatched);
            if (! $transfer->destinationWarehouse->is_active) {
                throw new DomainConflictException('The destination warehouse is inactive.', 'INACTIVE_MASTER_DATA');
            }
            $warehouseBalances = $this->warehouses->lock($transfer->destination_warehouse_id, $transfer->items->pluck('product_id')->all());
            $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $transfer->items->pluck('product_id')->all());
            $occurredAt = now();
            foreach ($transfer->items as $item) {
                $this->inTransit->decrease($transitBalances->get($item->product_id), $item->base_quantity);
                $this->warehouses->increase($warehouseBalances->get($item->product_id), $item->base_quantity);
                $this->movement($transfer, $item->product_id, $item->base_quantity, StockMovementType::WarehouseTransferReceive, 'in_transit', $transfer->id, 'warehouse', $transfer->destination_warehouse_id, $actor, $occurredAt);
            }
            $transfer->update(['status' => TransferStatus::Received, 'received_by' => $actor->id, 'received_at' => $occurredAt]);
            $this->auditLogger->record($request, 'warehouse_transfer.received', $actor, $transfer, $this->metadata($transfer));

            return $this->result($transfer, TransferStatus::Received);
        });
    }

    /** @return array<string, mixed> */
    public function cancel(WarehouseTransfer $transfer, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "warehouse-transfer:{$transfer->id}:cancel", $key, function () use ($transfer, $actor, $reason, $request): array {
            $transfer = $this->locked($transfer);
            $this->requireStatus($transfer, TransferStatus::Draft);
            $transfer->update(['status' => TransferStatus::Cancelled, 'cancelled_by' => $actor->id, 'cancelled_at' => now(), 'cancel_reason' => $reason]);
            $this->auditLogger->record($request, 'warehouse_transfer.cancelled', $actor, $transfer, $this->metadata($transfer) + ['reason' => $reason]);

            return $this->result($transfer, TransferStatus::Cancelled);
        });
    }

    /** @return array<string, mixed> */
    public function reverse(WarehouseTransfer $transfer, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "warehouse-transfer:{$transfer->id}:reverse", $key, function () use ($transfer, $actor, $reason, $request): array {
            $transfer = $this->locked($transfer);
            if (! in_array($transfer->status, [TransferStatus::Dispatched, TransferStatus::Received], true)) {
                throw new DomainConflictException('Only dispatched or received warehouse transfers can be reversed.', 'INVALID_DOCUMENT_STATE');
            }
            $occurredAt = now();
            if ($transfer->status === TransferStatus::Dispatched) {
                $sourceBalances = $this->warehouses->lock($transfer->source_warehouse_id, $transfer->items->pluck('product_id')->all());
                $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $transfer->items->pluck('product_id')->all());
                foreach ($transfer->items as $item) {
                    $this->inTransit->decrease($transitBalances->get($item->product_id), $item->base_quantity);
                    $this->warehouses->increase($sourceBalances->get($item->product_id), $item->base_quantity);
                    $this->movement($transfer, $item->product_id, $item->base_quantity, StockMovementType::ReversalIn, 'in_transit', $transfer->id, 'warehouse', $transfer->source_warehouse_id, $actor, $occurredAt, $reason);
                }
            } else {
                $locations = [];
                foreach ($transfer->items as $item) {
                    $locations[] = ['warehouse_id' => $transfer->source_warehouse_id, 'product_id' => $item->product_id];
                    $locations[] = ['warehouse_id' => $transfer->destination_warehouse_id, 'product_id' => $item->product_id];
                }
                $balances = $this->warehouses->lockMany($locations);
                foreach ($transfer->items as $item) {
                    $this->warehouses->decrease($balances->get($transfer->destination_warehouse_id.':'.$item->product_id), $item->base_quantity);
                    $this->warehouses->increase($balances->get($transfer->source_warehouse_id.':'.$item->product_id), $item->base_quantity);
                    $this->movement($transfer, $item->product_id, $item->base_quantity, StockMovementType::ReversalIn, 'warehouse', $transfer->destination_warehouse_id, 'warehouse', $transfer->source_warehouse_id, $actor, $occurredAt, $reason);
                }
            }
            $transfer->update(['status' => TransferStatus::Reversed, 'reversed_by' => $actor->id, 'reversed_at' => $occurredAt, 'reversal_reason' => $reason]);
            $this->auditLogger->record($request, 'warehouse_transfer.reversed', $actor, $transfer, $this->metadata($transfer) + ['reason' => $reason]);

            return $this->result($transfer, TransferStatus::Reversed);
        });
    }

    private function locked(WarehouseTransfer $transfer): WarehouseTransfer
    {
        return WarehouseTransfer::query()->with(['sourceWarehouse', 'destinationWarehouse', 'items.product', 'items.productUnit'])->lockForUpdate()->findOrFail($transfer->id);
    }

    private function requireStatus(WarehouseTransfer $transfer, TransferStatus $status): void
    {
        if ($transfer->status !== $status) {
            throw new DomainConflictException("Only {$status->value} warehouse transfers support this command.", 'INVALID_DOCUMENT_STATE', ['current_status' => $transfer->status->value]);
        }
    }

    private function assertPostable(WarehouseTransfer $transfer): void
    {
        if ($transfer->items->isEmpty()) {
            throw new DomainConflictException('A warehouse transfer must contain at least one item.', 'EMPTY_TRANSFER');
        }
        if (! $transfer->sourceWarehouse->is_active || ! $transfer->destinationWarehouse->is_active || $transfer->items->contains(fn ($item) => ! $item->product->is_active)) {
            throw new DomainConflictException('Inactive warehouses or products cannot be used for dispatch.', 'INACTIVE_MASTER_DATA');
        }
    }

    private function movement(WarehouseTransfer $transfer, int $productId, int $quantity, StockMovementType $type, string $fromType, int $fromId, string $toType, int $toId, User $actor, $occurredAt, ?string $notes = null): void
    {
        StockMovement::query()->create(['product_id' => $productId, 'movement_type' => $type, 'source_type' => 'warehouse_transfer', 'source_id' => $transfer->id, 'reference' => $transfer->reference, 'from_location_type' => $fromType, 'from_location_id' => $fromId, 'to_location_type' => $toType, 'to_location_id' => $toId, 'quantity' => $quantity, 'created_by' => $actor->id, 'notes' => $notes ?? $transfer->notes, 'occurred_at' => $occurredAt]);
    }

    /** @return array<string, mixed> */
    private function metadata(WarehouseTransfer $transfer): array
    {
        return ['reference' => $transfer->reference, 'source_warehouse_id' => $transfer->source_warehouse_id, 'destination_warehouse_id' => $transfer->destination_warehouse_id, 'items' => $transfer->items->map->only(['product_id', 'product_unit_id', 'quantity', 'base_quantity'])->all()];
    }

    /** @return array<string, mixed> */
    private function result(WarehouseTransfer $transfer, TransferStatus $status): array
    {
        return ['id' => $transfer->id, 'reference' => $transfer->reference, 'status' => $status->value];
    }
}
