<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;

class Warehouse extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'region',
        'township',
        'address',
        'phone',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::created(function (Warehouse $warehouse): void {
            if (! Schema::hasTable('regions') || $warehouse->regions()->exists()) {
                return;
            }
            $region = $warehouse->regions()->create(['name' => $warehouse->region ?: $warehouse->name.' Region', 'is_active' => true]);
            if (Schema::hasTable('ways')) {
                $region->ways()->create(['code' => 'WAY-'.str_pad((string) $region->id, 6, '0', STR_PAD_LEFT), 'name' => $warehouse->township ?: 'Default Way', 'is_active' => true]);
            }
        });
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_warehouse')
            ->withPivot('assigned_by')
            ->withTimestamps();
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }

    public function regions(): HasMany
    {
        return $this->hasMany(Region::class);
    }
}
