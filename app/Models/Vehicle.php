<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Vehicle extends Model
{
    use HasFactory;

    protected $fillable = [
        'vehicle_number',
        'vehicle_type',
        'brand',
        'model',
        'sales_representative_id',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean', 'sales_representative_id' => 'integer'];
    }

    public function representative(): BelongsTo
    {
        return $this->belongsTo(SalesRepresentative::class, 'sales_representative_id');
    }
}
