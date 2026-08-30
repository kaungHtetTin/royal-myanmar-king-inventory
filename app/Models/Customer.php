<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'warehouse_id',
        'region_id',
        'code',
        'name',
        'customer_type',
        'phone',
        'region',
        'township',
        'address',
        'credit_allowed',
        'credit_limit',
        'notes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'credit_allowed' => 'boolean',
            'credit_limit' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function assignedRegion(): BelongsTo
    {
        return $this->belongsTo(Region::class, 'region_id');
    }

    public function creditBalance(): HasOne
    {
        return $this->hasOne(CustomerCreditBalance::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class);
    }
}
