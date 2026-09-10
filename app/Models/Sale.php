<?php

namespace App\Models;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    protected $fillable = ['reference', 'trip_id', 'sales_representative_id', 'warehouse_id', 'region_id', 'customer_id', 'payment_type', 'payment_method', 'total_amount', 'cashback_amount', 'promotion_title', 'promotion_amount', 'status', 'notes', 'creation_latitude', 'creation_longitude', 'location_accuracy_meters', 'location_captured_at', 'created_by', 'posted_by', 'posted_at', 'voided_by', 'voided_at', 'void_reason'];

    protected function casts(): array
    {
        return ['payment_type' => PaymentType::class, 'status' => SaleStatus::class, 'total_amount' => 'integer', 'cashback_amount' => 'integer', 'promotion_amount' => 'integer', 'creation_latitude' => 'float', 'creation_longitude' => 'float', 'location_accuracy_meters' => 'integer', 'location_captured_at' => 'datetime', 'posted_at' => 'datetime', 'voided_at' => 'datetime'];
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

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
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
