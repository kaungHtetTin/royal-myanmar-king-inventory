<?php

namespace App\Models;

use App\Enums\AdjustmentType;
use App\Enums\InventoryDocumentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockAdjustment extends Model
{
    protected $fillable = ['reference', 'warehouse_id', 'product_id', 'adjustment_type', 'quantity', 'reason', 'notes', 'status', 'created_by', 'posted_by', 'posted_at'];

    protected function casts(): array
    {
        return ['adjustment_type' => AdjustmentType::class, 'status' => InventoryDocumentStatus::class, 'quantity' => 'integer', 'posted_at' => 'datetime'];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }
}
