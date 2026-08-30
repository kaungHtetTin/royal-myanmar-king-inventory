<?php

namespace App\Models;

use App\Enums\TripStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Trip extends Model
{
    protected $fillable = [
        'reference', 'title', 'warehouse_id', 'region_id', 'sales_representative_id', 'vehicle_id',
        'status', 'opening_cash_balance', 'notes', 'created_by', 'started_by', 'started_at',
        'ending_by', 'ending_at', 'completed_by', 'completed_at', 'completion_notes',
        'stock_variance_units', 'cash_variance_amount', 'cancelled_by', 'cancelled_at', 'cancel_reason',
    ];

    protected function casts(): array
    {
        return [
            'status' => TripStatus::class,
            'opening_cash_balance' => 'integer',
            'stock_variance_units' => 'integer',
            'cash_variance_amount' => 'integer',
            'started_at' => 'datetime',
            'ending_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
    }

    public function representative(): BelongsTo
    {
        return $this->belongsTo(SalesRepresentative::class, 'sales_representative_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function starter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'started_by');
    }

    public function endingActor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ending_by');
    }

    public function completer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function transfers(): HasMany
    {
        return $this->hasMany(RepresentativeTransfer::class);
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(TripExpense::class);
    }

    public function cashSubmissions(): HasMany
    {
        return $this->hasMany(CashSubmission::class);
    }

    public function customerPayments(): HasMany
    {
        return $this->hasMany(CustomerPayment::class);
    }
}
