<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleItem extends Model
{
    protected $fillable = ['product_id', 'product_unit_id', 'quantity', 'base_quantity', 'unit_price', 'discount_percentage', 'discount_amount', 'promotion_title', 'promotion_amount', 'line_total', 'foc_product_unit_id', 'foc_quantity', 'foc_base_quantity'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'base_quantity' => 'integer', 'unit_price' => 'integer', 'discount_percentage' => 'decimal:2', 'discount_amount' => 'integer', 'promotion_amount' => 'integer', 'line_total' => 'integer', 'foc_quantity' => 'integer', 'foc_base_quantity' => 'integer'];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
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
