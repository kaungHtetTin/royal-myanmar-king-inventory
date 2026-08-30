<?php

namespace App\Models;

use Database\Factories\SalesRepresentativeFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SalesRepresentative extends Model
{
    /** @use HasFactory<SalesRepresentativeFactory> */
    use HasFactory;

    protected $fillable = [
        'code',
        'user_id',
        'primary_warehouse_id',
        'name',
        'phone',
        'email',
        'region',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::created(function (SalesRepresentative $representative): void {
            $region = Region::query()->where('warehouse_id', $representative->primary_warehouse_id)
                ->when($representative->region, fn ($query, $name) => $query->where('name', $name))->first()
                ?? Region::query()->where('warehouse_id', $representative->primary_warehouse_id)->first();
            if ($region) {
                $representative->regions()->syncWithoutDetaching([$region->id]);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function primaryWarehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class, 'primary_warehouse_id');
    }

    public function vehicle(): HasOne
    {
        return $this->hasOne(Vehicle::class);
    }

    public function inventories(): HasMany
    {
        return $this->hasMany(RepresentativeInventory::class);
    }

    public function stockTransfers(): HasMany
    {
        return $this->hasMany(RepresentativeTransfer::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function cashBalance(): HasOne
    {
        return $this->hasOne(RepresentativeCashBalance::class);
    }

    public function cashSubmissions(): HasMany
    {
        return $this->hasMany(CashSubmission::class);
    }

    public function trips(): HasMany
    {
        return $this->hasMany(Trip::class);
    }

    public function regions(): BelongsToMany
    {
        return $this->belongsToMany(Region::class)->withTimestamps();
    }
}
