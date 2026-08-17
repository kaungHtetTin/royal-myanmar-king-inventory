<?php

namespace App\Models;

use App\Enums\FinancialTransactionType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RepresentativeCashTransaction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['sales_representative_id', 'transaction_type', 'amount_delta', 'source_type', 'source_id', 'reversal_of_id', 'reference', 'created_by', 'notes', 'occurred_at'];

    protected function casts(): array
    {
        return ['transaction_type' => FinancialTransactionType::class, 'amount_delta' => 'integer', 'occurred_at' => 'datetime'];
    }

    public function representative(): BelongsTo
    {
        return $this->belongsTo(SalesRepresentative::class, 'sales_representative_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
