<?php

namespace App\Services;

use App\Exceptions\DomainConflictException;
use App\Models\RepresentativeCashBalance;

class RepresentativeCashMutation
{
    public function lock(int $representativeId): RepresentativeCashBalance
    {
        RepresentativeCashBalance::query()->insertOrIgnore([
            'sales_representative_id' => $representativeId,
            'amount' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return RepresentativeCashBalance::query()->where('sales_representative_id', $representativeId)->lockForUpdate()->firstOrFail();
    }

    public function increase(RepresentativeCashBalance $balance, int $amount): void
    {
        $balance->update(['amount' => $balance->amount + $amount]);
    }

    public function decrease(RepresentativeCashBalance $balance, int $amount): void
    {
        if ($balance->amount < $amount) {
            throw new DomainConflictException('Representative cash hold is lower than the requested amount.', 'INSUFFICIENT_REPRESENTATIVE_CASH', ['available' => $balance->amount, 'requested' => $amount]);
        }
        $balance->update(['amount' => $balance->amount - $amount]);
    }
}
