<?php

namespace App\Models;

use App\Enums\InventoryDocumentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StockImport extends Model
{
    protected $fillable = ['reference', 'warehouse_id', 'status', 'notes', 'created_by', 'posted_by', 'posted_at', 'voided_by', 'voided_at', 'void_reason'];

    protected function casts(): array
    {
        return ['status' => InventoryDocumentStatus::class, 'posted_at' => 'datetime', 'voided_at' => 'datetime'];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(StockImportItem::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function voider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by');
    }
}
