<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RepresentativeTransferItem extends Model
{
    protected $fillable = ['representative_transfer_id', 'product_id', 'product_unit_id', 'quantity', 'base_quantity', 'foc_product_unit_id', 'foc_quantity', 'foc_base_quantity'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'base_quantity' => 'integer', 'foc_quantity' => 'integer', 'foc_base_quantity' => 'integer'];
    }

    public function transfer(): BelongsTo
    {
        return $this->belongsTo(RepresentativeTransfer::class, 'representative_transfer_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(ProductUnit::class, 'product_unit_id');
    }

    public function focUnit(): BelongsTo
    {
        return $this->belongsTo(ProductUnit::class, 'foc_product_unit_id');
    }
}
