<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductUnit extends Model
{
    protected $fillable = ['product_id', 'name', 'conversion_factor', 'barcode', 'is_base', 'is_default_selling', 'is_active'];

    protected function casts(): array
    {
        return ['conversion_factor' => 'integer', 'is_base' => 'boolean', 'is_default_selling' => 'boolean', 'is_active' => 'boolean'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function regionPrices(): HasMany
    {
        return $this->hasMany(RegionProductPrice::class);
    }
}
