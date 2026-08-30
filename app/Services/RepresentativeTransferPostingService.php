<?php

namespace App\Services;

use App\Enums\StockMovementType;
use App\Enums\TransferStatus;
use App\Enums\TripStatus;
use App\Exceptions\DomainConflictException;
use App\Models\RepresentativeInventory;
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
            if ($transfer->direction !== 'issue') {
                throw new DomainConflictException('Representative returns must use the return posting command.', 'INVALID_DOCUMENT_DIRECTION');
            }
            if (! $transfer->trip || ! in_array($transfer->trip->status, [TripStatus::Planning, TripStatus::Operation], true)) {
                throw new DomainConflictException('Stock issues require a planning or operating trip.', 'INVALID_TRIP_STATE');
            }
            $this->assertPostable($transfer);
            $productIds = $transfer->items->pluck('product_id')->all();
            $representativeBalances = $this->representatives->lock($transfer->sales_representative_id, $productIds);
            foreach ($transfer->items as $item) {
                $this->representatives->assertIncomingAllowed($transfer->sales_representative_id, $representativeBalances->get($item->product_id), $item->base_quantity + $item->foc_base_quantity);
            }
            $warehouseBalances = $this->warehouses->lock($transfer->source_warehouse_id, $productIds);
            $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $productIds);
            $occurredAt = now();
            foreach ($transfer->items as $item) {
                $physical = $item->base_quantity + $item->foc_base_quantity;
                $this->warehouses->decrease($warehouseBalances->get($item->product_id), $physical);
                $this->inTransit->increase($transitBalances->get($item->product_id), $physical);
                $this->movement($transfer, $item->product_id, $physical, StockMovementType::RepresentativeTransferDispatch, 'warehouse', $transfer->source_warehouse_id, 'in_transit', $transfer->id, $actor, $occurredAt);
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
            if ($transfer->direction !== 'issue') {
                throw new DomainConflictException('Representative returns are received by the office posting command.', 'INVALID_DOCUMENT_DIRECTION');
            }
            $productIds = $transfer->items->pluck('product_id')->all();
            $representativeBalances = $this->representatives->lock($transfer->sales_representative_id, $productIds);
            $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $productIds);
            $occurredAt = now();
            foreach ($transfer->items as $item) {
                $physical = $item->base_quantity + $item->foc_base_quantity;
                $this->inTransit->decrease($transitBalances->get($item->product_id), $physical);
                $this->representatives->increase($representativeBalances->get($item->product_id), $item->base_quantity);
                $this->representatives->increaseFoc($representativeBalances->get($item->product_id), $item->foc_base_quantity);
                $this->movement($transfer, $item->product_id, $physical, StockMovementType::RepresentativeTransferReceive, 'in_transit', $transfer->id, 'representative', $transfer->sales_representative_id, $actor, $occurredAt);
            }
            $transfer->update(['status' => TransferStatus::Received, 'received_by' => $actor->id, 'received_at' => $occurredAt]);
            $this->auditLogger->record($request, 'representative_transfer.received', $actor, $transfer, $this->metadata($transfer));

            return $this->result($transfer, TransferStatus::Received);
        });
    }

    /** @return array<string, mixed> */
    public function postReturn(RepresentativeTransfer $transfer, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "representative-return:{$transfer->id}:post", $key, function () use ($transfer, $actor, $request): array {
            $transfer = $this->locked($transfer);
            $this->requireStatus($transfer, TransferStatus::Draft);
            if ($transfer->direction !== 'return') {
                throw new DomainConflictException('Only representative return documents support this command.', 'INVALID_DOCUMENT_DIRECTION');
            }
            if ($transfer->trip && $transfer->trip->status !== TripStatus::Ending) {
                throw new DomainConflictException('Trip-linked stock returns require the trip to be in ending state.', 'INVALID_TRIP_STATE');
            }
            $this->assertPostable($transfer);
            $heldBalances = RepresentativeInventory::query()
                ->where('sales_representative_id', $transfer->sales_representative_id)
                ->where(fn ($query) => $query->where('quantity', '>', 0)->orWhere('foc_quantity', '>', 0))
                ->orderBy('product_id')
                ->lockForUpdate()
                ->get();
            $held = $heldBalances->mapWithKeys(fn (RepresentativeInventory $balance): array => [
                $balance->product_id => [(int) $balance->quantity, (int) $balance->foc_quantity],
            ])->all();
            $returning = $transfer->items->mapWithKeys(fn ($item): array => [
                $item->product_id => [(int) $item->base_quantity, (int) $item->foc_base_quantity],
            ])->all();
            ksort($held);
            ksort($returning);
            $invalidReturn = $transfer->trip
                ? $returning !== $held
                : collect($returning)->contains(function (array $quantities, int $productId) use ($held): bool {
                    $available = $held[$productId] ?? [0, 0];

                    return $quantities[0] > $available[0] || $quantities[1] > $available[1];
                });
            if ($held === [] || $invalidReturn) {
                throw new DomainConflictException(
                    $transfer->trip
                        ? 'Return every paid and FOC unit currently held by the representative. Partial stock returns are not allowed.'
                        : 'A return quantity exceeds the stock currently held by the representative.',
                    'INCOMPLETE_REPRESENTATIVE_RETURN',
                );
            }
            $productIds = array_keys($held);
            $representativeBalances = $this->representatives->lock($transfer->sales_representative_id, $productIds);
            $warehouseBalances = $this->warehouses->lock($transfer->source_warehouse_id, $productIds);
            $occurredAt = now();
            foreach ($transfer->items as $item) {
                $physical = $item->base_quantity + $item->foc_base_quantity;
                $this->representatives->decrease($representativeBalances->get($item->product_id), $item->base_quantity);
                $this->representatives->decreaseFoc($representativeBalances->get($item->product_id), $item->foc_base_quantity);
                $this->warehouses->increase($warehouseBalances->get($item->product_id), $physical);
                $this->movement($transfer, $item->product_id, $physical, StockMovementType::RepresentativeReturn, 'representative', $transfer->sales_representative_id, 'warehouse', $transfer->source_warehouse_id, $actor, $occurredAt);
            }
            $transfer->update([
                'status' => TransferStatus::Received,
                'dispatched_by' => $actor->id,
                'dispatched_at' => $occurredAt,
                'received_by' => $actor->id,
                'received_at' => $occurredAt,
            ]);
            $this->auditLogger->record($request, 'representative_return.posted', $actor, $transfer, $this->metadata($transfer));

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
            if ($transfer->direction === 'return') {
                foreach ($transfer->items as $item) {
                    $physical = $item->base_quantity + $item->foc_base_quantity;
                    $this->warehouses->decrease($warehouseBalances->get($item->product_id), $physical);
                    $this->representatives->increase($representativeBalances->get($item->product_id), $item->base_quantity);
                    $this->representatives->increaseFoc($representativeBalances->get($item->product_id), $item->foc_base_quantity);
                    $this->movement($transfer, $item->product_id, $physical, StockMovementType::ReversalIn, 'warehouse', $transfer->source_warehouse_id, 'representative', $transfer->sales_representative_id, $actor, $occurredAt, $reason);
                }
            } elseif ($transfer->status === TransferStatus::Dispatched) {
                $transitBalances = $this->inTransit->lock(self::TRANSIT_TYPE, $transfer->id, $productIds);
                foreach ($transfer->items as $item) {
                    $physical = $item->base_quantity + $item->foc_base_quantity;
                    $this->inTransit->decrease($transitBalances->get($item->product_id), $physical);
                    $this->warehouses->increase($warehouseBalances->get($item->product_id), $physical);
                    $this->movement($transfer, $item->product_id, $physical, StockMovementType::ReversalIn, 'in_transit', $transfer->id, 'warehouse', $transfer->source_warehouse_id, $actor, $occurredAt, $reason);
                }
            } else {
                foreach ($transfer->items as $item) {
                    $physical = $item->base_quantity + $item->foc_base_quantity;
                    $this->representatives->decrease($representativeBalances->get($item->product_id), $item->base_quantity);
                    $this->representatives->decreaseFoc($representativeBalances->get($item->product_id), $item->foc_base_quantity);
                    $this->warehouses->increase($warehouseBalances->get($item->product_id), $physical);
                    $this->movement($transfer, $item->product_id, $physical, StockMovementType::ReversalIn, 'representative', $transfer->sales_representative_id, 'warehouse', $transfer->source_warehouse_id, $actor, $occurredAt, $reason);
                }
            }
            $transfer->update(['status' => TransferStatus::Reversed, 'reversed_by' => $actor->id, 'reversed_at' => $occurredAt, 'reversal_reason' => $reason]);
            $this->auditLogger->record($request, 'representative_transfer.reversed', $actor, $transfer, $this->metadata($transfer) + ['reason' => $reason]);

            return $this->result($transfer, TransferStatus::Reversed);
        });
    }

    private function locked(RepresentativeTransfer $transfer): RepresentativeTransfer
    {
        return RepresentativeTransfer::query()->with(['trip', 'sourceWarehouse', 'representative', 'items.product', 'items.unit', 'items.focUnit'])->lockForUpdate()->findOrFail($transfer->id);
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
        return ['reference' => $transfer->reference, 'direction' => $transfer->direction, 'source_warehouse_id' => $transfer->source_warehouse_id, 'sales_representative_id' => $transfer->sales_representative_id, 'items' => $transfer->items->map->only(['product_id', 'product_unit_id', 'quantity', 'base_quantity', 'foc_product_unit_id', 'foc_quantity', 'foc_base_quantity'])->all()];
    }

    /** @return array<string, mixed> */
    private function result(RepresentativeTransfer $transfer, TransferStatus $status): array
    {
        return ['id' => $transfer->id, 'reference' => $transfer->reference, 'status' => $status->value];
    }
}
