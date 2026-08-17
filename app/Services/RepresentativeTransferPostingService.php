<?php

namespace App\Services;

use App\Enums\StockMovementType;
use App\Enums\TransferStatus;
use App\Exceptions\DomainConflictException;
use App\Models\RepresentativeTransfer;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Http\Request;

class RepresentativeTransferPostingService
{
    private const TRANSIT_TYPE = 'representative_transfer';

    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly WarehouseInventoryMutation $warehouses,
        private readonly RepresentativeInventoryMutation $representatives,
        private readonly InTransitInventoryMutation $inTransit,
        private readonly AuditLogger $auditLogger,
    ) {}

    /** @return array<string, mixed> */
    public function dispatch(RepresentativeTransfer $transfer, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "representative-transfer:{$transfer->id}:dispatch", $key, function () use ($transfer, $actor, $request): array {
            $transfer = $this->locked($transfer);
            $this->requireStatus($transfer, TransferStatus::Draft);
            $this->assertPostable($transfer);
            $productIds = $transfer->items->pluck('product_id')->all();
            $representativeBalances = $this->representatives->lock($transfer->sales_representative_id, $productIds);
            foreach ($transfer->items as $item) {
                $this->representatives->assertIncomingAllowed($transfer->sales_representative_id, $representativeBalances->get($item->product_id), $item->quantity);
            }
            $warehouseBalances = $this->warehouses->lock($transfer->source_warehouse_id, $productIds);
            $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $productIds);
            $occurredAt = now();
            foreach ($transfer->items as $item) {
                $this->warehouses->decrease($warehouseBalances->get($item->product_id), $item->quantity);
                $this->inTransit->increase($transitBalances->get($item->product_id), $item->quantity);
                $this->movement($transfer, $item->product_id, $item->quantity, StockMovementType::RepresentativeTransferDispatch, 'warehouse', $transfer->source_warehouse_id, 'in_transit', $transfer->id, $actor, $occurredAt);
            }
            $transfer->update(['status' => TransferStatus::Dispatched, 'dispatched_by' => $actor->id, 'dispatched_at' => $occurredAt]);
            $this->auditLogger->record($request, 'representative_transfer.dispatched', $actor, $transfer, $this->metadata($transfer));

            return $this->result($transfer, TransferStatus::Dispatched);
        });
    }

    /** @return array<string, mixed> */
    public function receive(RepresentativeTransfer $transfer, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "representative-transfer:{$transfer->id}:receive", $key, function () use ($transfer, $actor, $request): array {
            $transfer = $this->locked($transfer);
            $this->requireStatus($transfer, TransferStatus::Dispatched);
            $productIds = $transfer->items->pluck('product_id')->all();
            $representativeBalances = $this->representatives->lock($transfer->sales_representative_id, $productIds);
            $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $productIds);
            $occurredAt = now();
            foreach ($transfer->items as $item) {
                $this->inTransit->decrease($transitBalances->get($item->product_id), $item->quantity);
                $this->representatives->increase($representativeBalances->get($item->product_id), $item->quantity);
                $this->movement($transfer, $item->product_id, $item->quantity, StockMovementType::RepresentativeTransferReceive, 'in_transit', $transfer->id, 'representative', $transfer->sales_representative_id, $actor, $occurredAt);
            }
            $transfer->update(['status' => TransferStatus::Received, 'received_by' => $actor->id, 'received_at' => $occurredAt]);
            $this->auditLogger->record($request, 'representative_transfer.received', $actor, $transfer, $this->metadata($transfer));

            return $this->result($transfer, TransferStatus::Received);
        });
    }

    /** @return array<string, mixed> */
    public function cancel(RepresentativeTransfer $transfer, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "representative-transfer:{$transfer->id}:cancel", $key, function () use ($transfer, $actor, $reason, $request): array {
            $transfer = $this->locked($transfer);
            $this->requireStatus($transfer, TransferStatus::Draft);
            $transfer->update(['status' => TransferStatus::Cancelled, 'cancelled_by' => $actor->id, 'cancelled_at' => now(), 'cancel_reason' => $reason]);
            $this->auditLogger->record($request, 'representative_transfer.cancelled', $actor, $transfer, $this->metadata($transfer) + ['reason' => $reason]);

            return $this->result($transfer, TransferStatus::Cancelled);
        });
    }

    /** @return array<string, mixed> */
    public function reverse(RepresentativeTransfer $transfer, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "representative-transfer:{$transfer->id}:reverse", $key, function () use ($transfer, $actor, $reason, $request): array {
            $transfer = $this->locked($transfer);
            if (! in_array($transfer->status, [TransferStatus::Dispatched, TransferStatus::Received], true)) {
                throw new DomainConflictException('Only dispatched or received representative transfers can be reversed.', 'INVALID_DOCUMENT_STATE');
            }
            $productIds = $transfer->items->pluck('product_id')->all();
            $representativeBalances = $this->representatives->lock($transfer->sales_representative_id, $productIds);
            $warehouseBalances = $this->warehouses->lock($transfer->source_warehouse_id, $productIds);
            $occurredAt = now();
            if ($transfer->status === TransferStatus::Dispatched) {
                $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $productIds);
                foreach ($transfer->items as $item) {
                    $this->inTransit->decrease($transitBalances->get($item->product_id), $item->quantity);
                    $this->warehouses->increase($warehouseBalances->get($item->product_id), $item->quantity);
                    $this->movement($transfer, $item->product_id, $item->quantity, StockMovementType::ReversalIn, 'in_transit', $transfer->id, 'warehouse', $transfer->source_warehouse_id, $actor, $occurredAt, $reason);
                }
            } else {
                foreach ($transfer->items as $item) {
                    $this->representatives->decrease($representativeBalances->get($item->product_id), $item->quantity);
                    $this->warehouses->increase($warehouseBalances->get($item->product_id), $item->quantity);
                    $this->movement($transfer, $item->product_id, $item->quantity, StockMovementType::ReversalIn, 'representative', $transfer->sales_representative_id, 'warehouse', $transfer->source_warehouse_id, $actor, $occurredAt, $reason);
                }
            }
            $transfer->update(['status' => TransferStatus::Reversed, 'reversed_by' => $actor->id, 'reversed_at' => $occurredAt, 'reversal_reason' => $reason]);
            $this->auditLogger->record($request, 'representative_transfer.reversed', $actor, $transfer, $this->metadata($transfer) + ['reason' => $reason]);

            return $this->result($transfer, TransferStatus::Reversed);
        });
    }

    private function locked(RepresentativeTransfer $transfer): RepresentativeTransfer
    {
        return RepresentativeTransfer::query()->with(['sourceWarehouse', 'representative', 'items.product'])->lockForUpdate()->findOrFail($transfer->id);
    }

    private function requireStatus(RepresentativeTransfer $transfer, TransferStatus $status): void
    {
        if ($transfer->status !== $status) {
            throw new DomainConflictException("Only {$status->value} representative transfers support this command.", 'INVALID_DOCUMENT_STATE', ['current_status' => $transfer->status->value]);
        }
    }

    private function assertPostable(RepresentativeTransfer $transfer): void
    {
        if ($transfer->items->isEmpty()) {
            throw new DomainConflictException('A representative transfer must contain at least one item.', 'EMPTY_TRANSFER');
        }
        if (! $transfer->sourceWarehouse->is_active || ! $transfer->representative->is_active || $transfer->items->contains(fn ($item) => ! $item->product->is_active)) {
            throw new DomainConflictException('Inactive warehouses, representatives, or products cannot be used for dispatch.', 'INACTIVE_MASTER_DATA');
        }
    }

    private function movement(RepresentativeTransfer $transfer, int $productId, int $quantity, StockMovementType $type, string $fromType, int $fromId, string $toType, int $toId, User $actor, $occurredAt, ?string $notes = null): void
    {
        StockMovement::query()->create(['product_id' => $productId, 'movement_type' => $type, 'source_type' => 'representative_transfer', 'source_id' => $transfer->id, 'reference' => $transfer->reference, 'from_location_type' => $fromType, 'from_location_id' => $fromId, 'to_location_type' => $toType, 'to_location_id' => $toId, 'quantity' => $quantity, 'created_by' => $actor->id, 'notes' => $notes ?? $transfer->notes, 'occurred_at' => $occurredAt]);
    }

    /** @return array<string, mixed> */
    private function metadata(RepresentativeTransfer $transfer): array
    {
        return ['reference' => $transfer->reference, 'source_warehouse_id' => $transfer->source_warehouse_id, 'sales_representative_id' => $transfer->sales_representative_id, 'items' => $transfer->items->map->only(['product_id', 'quantity'])->all()];
    }

    /** @return array<string, mixed> */
    private function result(RepresentativeTransfer $transfer, TransferStatus $status): array
    {
        return ['id' => $transfer->id, 'reference' => $transfer->reference, 'status' => $status->value];
    }
}
