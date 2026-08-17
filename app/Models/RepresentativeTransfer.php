<?php

namespace App\Models;

use App\Enums\TransferStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RepresentativeTransfer extends Model
{
    protected $fillable = ['reference', 'source_warehouse_id', 'sales_representative_id', 'status', 'notes', 'created_by', 'dispatched_by', 'dispatched_at', 'received_by', 'received_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'reversed_by', 'reversed_at', 'reversal_reason'];

    protected function casts(): array
    {
        return ['status' => TransferStatus::class, 'dispatched_at' => 'datetime', 'received_at' => 'datetime', 'cancelled_at' => 'datetime', 'reversed_at' => 'datetime'];
    }

    public function sourceWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'source_warehouse_id');
    }

    public function representative(): BelongsTo
    {
        return $this->belongsTo(SalesRepresentative::class, 'sales_representative_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(RepresentativeTransferItem::class);
    }

    public function transit(): HasMany
    {
        return $this->hasMany(InTransitInventory::class, 'transfer_id')->where('transfer_type', 'representative_transfer');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function dispatcher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dispatched_by');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function reverser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reversed_by');
    }
}
