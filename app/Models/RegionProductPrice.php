<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegionProductPrice extends Model
{
    protected $fillable = ['region_id', 'product_unit_id', 'price'];

    protected function casts(): array
    {
        return ['price' => 'integer'];
    }

    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
    }

    public function productUnit(): BelongsTo
    {
        return $this->belongsTo(ProductUnit::class);
    }
}
