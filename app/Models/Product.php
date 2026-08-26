<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Schema;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'sku',
        'name',
        'category',
        'unit',
        'selling_price',
        'barcode',
        'description',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'selling_price' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::created(function (Product $product): void {
            if (! Schema::hasTable('product_units') || $product->units()->exists()) {
                return;
            }
            $unit = $product->units()->create(['name' => $product->unit, 'conversion_factor' => 1, 'barcode' => $product->barcode, 'is_base' => true, 'is_default_selling' => true, 'is_active' => true]);
            if (Schema::hasTable('regions')) {
                foreach (Region::query()->pluck('id') as $regionId) {
                    $unit->regionPrices()->create(['region_id' => $regionId, 'price' => $product->selling_price]);
                }
            }
        });
        static::updated(function (Product $product): void {
            if ($product->wasChanged('selling_price') && Schema::hasTable('product_units')) {
                $unit = $product->defaultSellingUnit()->first();
                $unit?->regionPrices()->update(['price' => $product->selling_price]);
            }
        });
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function units(): HasMany
    {
        return $this->hasMany(ProductUnit::class);
    }

    public function baseUnit(): HasOne
    {
        return $this->hasOne(ProductUnit::class)->where('is_base', true);
    }

    public function defaultSellingUnit(): HasOne
    {
        return $this->hasOne(ProductUnit::class)->where('is_default_selling', true);
    }
}
