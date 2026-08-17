<?php

namespace App\Models;

use App\Enums\StockMovementType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StockMovement extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['product_id', 'movement_type', 'source_type', 'source_id', 'reference', 'from_location_type', 'from_location_id', 'to_location_type', 'to_location_id', 'quantity', 'created_by', 'notes', 'occurred_at'];

    protected function casts(): array
    {
        return ['movement_type' => StockMovementType::class, 'quantity' => 'integer', 'occurred_at' => 'datetime'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
