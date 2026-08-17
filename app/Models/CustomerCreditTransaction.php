<?php

namespace App\Models;

use App\Enums\FinancialTransactionType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCreditTransaction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['customer_id', 'transaction_type', 'amount_delta', 'source_type', 'source_id', 'reversal_of_id', 'reference', 'created_by', 'notes', 'occurred_at'];

    protected function casts(): array
    {
        return ['transaction_type' => FinancialTransactionType::class, 'amount_delta' => 'integer', 'occurred_at' => 'datetime'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
