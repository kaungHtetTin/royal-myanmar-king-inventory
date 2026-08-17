<?php

namespace App\Services;

use App\Exceptions\DomainConflictException;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;

class CustomerCreditMutation
{
    public function lock(Customer $customer): CustomerCreditBalance
    {
        CustomerCreditBalance::query()->insertOrIgnore([
            'customer_id' => $customer->id,
            'outstanding_amount' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return CustomerCreditBalance::query()->where('customer_id', $customer->id)->lockForUpdate()->firstOrFail();
    }

    public function assertSaleAllowed(Customer $customer, CustomerCreditBalance $balance, int $amount): void
    {
        if (! $customer->credit_allowed) {
            throw new DomainConflictException('Credit sales are disabled for this customer.', 'CUSTOMER_CREDIT_DISABLED');
        }
        $projected = $balance->outstanding_amount + $amount;
        if ($projected > $customer->credit_limit) {
            throw new DomainConflictException('The sale exceeds the customer available credit.', 'CUSTOMER_CREDIT_LIMIT_EXCEEDED', [
                'outstanding' => $balance->outstanding_amount,
                'sale_amount' => $amount,
                'projected' => $projected,
                'credit_limit' => $customer->credit_limit,
                'available_credit' => max(0, $customer->credit_limit - $balance->outstanding_amount),
            ]);
        }
    }

    public function increase(CustomerCreditBalance $balance, int $amount): void
    {
        $balance->update(['outstanding_amount' => $balance->outstanding_amount + $amount]);
    }

    public function decrease(CustomerCreditBalance $balance, int $amount): void
    {
        if ($balance->outstanding_amount < $amount) {
            throw new DomainConflictException('Customer outstanding credit is lower than the reversal amount.', 'INSUFFICIENT_CUSTOMER_CREDIT');
        }
        $balance->update(['outstanding_amount' => $balance->outstanding_amount - $amount]);
    }
}
