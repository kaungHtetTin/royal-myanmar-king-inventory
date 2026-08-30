<?php

namespace App\Models;

use App\Enums\CashSubmissionStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashSubmission extends Model
{
    protected $fillable = ['reference', 'trip_id', 'sales_representative_id', 'warehouse_id', 'amount', 'status', 'notes', 'created_by', 'confirmed_by', 'confirmed_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'reversed_by', 'reversed_at', 'reversal_reason'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'status' => CashSubmissionStatus::class, 'confirmed_at' => 'datetime', 'cancelled_at' => 'datetime', 'reversed_at' => 'datetime'];
    }

    public function representative(): BelongsTo
    {
        return $this->belongsTo(SalesRepresentative::class, 'sales_representative_id');
    }

    public function trip(): BelongsTo
    {
        return $this->belongsTo(Trip::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function confirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function reverser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reversed_by');
    }
}
