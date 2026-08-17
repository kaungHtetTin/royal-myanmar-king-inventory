<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCreditBalance extends Model
{
    protected $fillable = ['customer_id', 'outstanding_amount'];

    protected function casts(): array
    {
        return ['outstanding_amount' => 'integer'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
