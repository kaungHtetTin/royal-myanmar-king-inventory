<?php

namespace App\Models;

use App\Enums\CustomerPaymentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerPayment extends Model
{
    protected $fillable = ['reference', 'warehouse_id', 'customer_id', 'amount', 'payment_date', 'payment_method', 'payment_reference', 'notes', 'status', 'received_by', 'created_by', 'posted_by', 'posted_at', 'voided_by', 'voided_at', 'void_reason'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'payment_date' => 'date', 'status' => CustomerPaymentStatus::class, 'posted_at' => 'datetime', 'voided_at' => 'datetime'];
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function voider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by');
    }
}
