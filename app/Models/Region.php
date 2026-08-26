<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Region extends Model
{
    protected $fillable = ['warehouse_id', 'name', 'notes', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function ways(): HasMany
    {
        return $this->hasMany(Way::class);
    }

    public function representatives(): BelongsToMany
    {
        return $this->belongsToMany(SalesRepresentative::class)->withTimestamps();
    }

    public function prices(): HasMany
    {
        return $this->hasMany(RegionProductPrice::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }
}
