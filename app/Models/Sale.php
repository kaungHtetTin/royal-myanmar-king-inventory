<?php

namespace App\Models;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    protected $fillable = ['reference', 'sales_representative_id', 'warehouse_id', 'customer_id', 'payment_type', 'total_amount', 'status', 'notes', 'created_by', 'posted_by', 'posted_at', 'voided_by', 'voided_at', 'void_reason'];

    protected function casts(): array
    {
        return ['payment_type' => PaymentType::class, 'status' => SaleStatus::class, 'total_amount' => 'integer', 'posted_at' => 'datetime', 'voided_at' => 'datetime'];
    }

    public function representative(): BelongsTo
    {
        return $this->belongsTo(SalesRepresentative::class, 'sales_representative_id');
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
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
