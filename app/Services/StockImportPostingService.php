<?php

namespace App\Services;

use App\Enums\InventoryDocumentStatus;
use App\Enums\StockMovementType;
use App\Exceptions\DomainConflictException;
use App\Models\StockImport;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Http\Request;

class StockImportPostingService
{
    public function __construct(
        private readonly IdempotencyService $idempotency,
        private readonly WarehouseInventoryMutation $inventory,
        private readonly AuditLogger $auditLogger,
    ) {}

    /** @return array<string, mixed> */
    public function post(StockImport $import, User $actor, string $key, Request $request): array
    {
        return $this->idempotency->execute($actor, "stock-import:{$import->id}:post", $key, function () use ($import, $actor, $request): array {
            $import = StockImport::query()->with(['warehouse', 'items.product', 'items.productUnit'])->lockForUpdate()->findOrFail($import->id);
            $this->requireStatus($import, InventoryDocumentStatus::Draft);
            if ($import->items->isEmpty()) {
                throw new DomainConflictException('A stock import must contain at least one item.', 'EMPTY_IMPORT');
            }
            if (! $import->warehouse->is_active || $import->items->contains(fn ($item) => ! $item->product->is_active)) {
                throw new DomainConflictException('Inactive warehouses or products cannot be used for posting.', 'INACTIVE_MASTER_DATA');
            }

            $balances = $this->inventory->lock($import->warehouse_id, $import->items->pluck('product_id')->all());
            $occurredAt = now();
            foreach ($import->items as $item) {
                $this->inventory->increase($balances->get($item->product_id), $item->base_quantity);
                StockMovement::query()->create([
                    'product_id' => $item->product_id,
                    'movement_type' => StockMovementType::ImportIn,
                    'source_type' => 'stock_import',
                    'source_id' => $import->id,
                    'reference' => $import->reference,
                    'to_location_type' => 'warehouse',
                    'to_location_id' => $import->warehouse_id,
                    'quantity' => $item->base_quantity,
                    'created_by' => $actor->id,
                    'notes' => $import->notes,
                    'occurred_at' => $occurredAt,
                ]);
            }
            $import->update([
                'status' => InventoryDocumentStatus::Posted,
                'posted_by' => $actor->id,
                'posted_at' => $occurredAt,
            ]);
            $this->auditLogger->record($request, 'stock_import.posted', $actor, $import, [
                'reference' => $import->reference,
                'warehouse_id' => $import->warehouse_id,
                'items' => $import->items->map->only(['product_id', 'product_unit_id', 'quantity', 'base_quantity'])->all(),
            ]);

            return ['id' => $import->id, 'reference' => $import->reference, 'status' => InventoryDocumentStatus::Posted->value];
        });
    }

    /** @return array<string, mixed> */
    public function void(StockImport $import, User $actor, string $key, string $reason, Request $request): array
    {
        return $this->idempotency->execute($actor, "stock-import:{$import->id}:void", $key, function () use ($import, $actor, $reason, $request): array {
            $import = StockImport::query()->with('items')->lockForUpdate()->findOrFail($import->id);
            $this->requireStatus($import, InventoryDocumentStatus::Posted);
            $balances = $this->inventory->lock($import->warehouse_id, $import->items->pluck('product_id')->all());
            $occurredAt = now();
            foreach ($import->items as $item) {
                $this->inventory->decrease($balances->get($item->product_id), $item->base_quantity);
                StockMovement::query()->create([
                    'product_id' => $item->product_id,
                    'movement_type' => StockMovementType::ReversalOut,
                    'source_type' => 'stock_import_void',
                    'source_id' => $import->id,
                    'reference' => $import->reference,
                    'from_location_type' => 'warehouse',
                    'from_location_id' => $import->warehouse_id,
                    'quantity' => $item->base_quantity,
                    'created_by' => $actor->id,
                    'notes' => $reason,
                    'occurred_at' => $occurredAt,
                ]);
            }
            $import->update([
                'status' => InventoryDocumentStatus::Voided,
                'voided_by' => $actor->id,
                'voided_at' => $occurredAt,
                'void_reason' => $reason,
            ]);
            $this->auditLogger->record($request, 'stock_import.voided', $actor, $import, [
                'reference' => $import->reference,
                'warehouse_id' => $import->warehouse_id,
                'reason' => $reason,
            ]);

            return ['id' => $import->id, 'reference' => $import->reference, 'status' => InventoryDocumentStatus::Voided->value];
        });
    }

    private function requireStatus(StockImport $import, InventoryDocumentStatus $status): void
    {
        if ($import->status !== $status) {
            throw new DomainConflictException("Only {$status->value} stock imports support this command.", 'INVALID_DOCUMENT_STATE', [
                'current_status' => $import->status->value,
                'required_status' => $status->value,
            ]);
        }
    }
}
