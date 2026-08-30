<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warehouse extends Model
{
    use HasFactory;

    protected $fillable = [
        'code',
        'name',
        'address',
        'phone',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
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

    public function salesRepresentatives(): HasMany
    {
        return $this->hasMany(SalesRepresentative::class, 'primary_warehouse_id');
    }

    public function trips(): HasMany
    {
        return $this->hasMany(Trip::class);
    }
}
