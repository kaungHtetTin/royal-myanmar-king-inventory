<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\SalesRepresentative;
use App\Models\Trip;
use Database\Seeders\OperationProcessSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OperationProcessSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_seeds_a_repeatable_complete_operation_process(): void
    {
        $this->seed(OperationProcessSeeder::class);

        $trip = Trip::query()->where('notes', 'End-to-end operation process demo.')->firstOrFail();
        $representative = SalesRepresentative::query()->where('code', 'SR-003')->firstOrFail();
        $customer = Customer::query()->where('code', 'CUS-NPT01')->firstOrFail();

        $this->assertSame('completed', $trip->status->value);
        $this->assertDatabaseHas('representative_transfers', [
            'trip_id' => $trip->id,
            'direction' => 'issue',
            'status' => 'received',
        ]);
        $this->assertDatabaseHas('representative_transfers', [
            'trip_id' => $trip->id,
            'direction' => 'return',
            'status' => 'received',
        ]);
        $this->assertSame(3, $trip->sales()->where('status', 'posted')->count());
        $this->assertDatabaseHas('sale_items', ['foc_quantity' => 2, 'foc_base_quantity' => 2]);
        $this->assertDatabaseHas('customer_payments', [
            'trip_id' => $trip->id,
            'sales_representative_id' => $representative->id,
            'amount' => 4000,
            'status' => 'posted',
        ]);
        $this->assertDatabaseHas('trip_expenses', ['trip_id' => $trip->id, 'amount' => 1500]);
        $this->assertDatabaseHas('cash_submissions', [
            'trip_id' => $trip->id,
            'sales_representative_id' => $representative->id,
            'amount' => 33300,
            'status' => 'confirmed',
        ]);
        $this->assertSame(0, (int) RepresentativeInventory::query()
            ->where('sales_representative_id', $representative->id)
            ->sum('quantity'));
        $this->assertSame(0, (int) RepresentativeInventory::query()
            ->where('sales_representative_id', $representative->id)
            ->sum('foc_quantity'));
        $this->assertSame(0, (int) RepresentativeCashBalance::query()
            ->where('sales_representative_id', $representative->id)
            ->value('amount'));
        $this->assertSame(7400, (int) CustomerCreditBalance::query()
            ->where('customer_id', $customer->id)
            ->value('outstanding_amount'));

        $counts = [
            'trips' => Trip::query()->count(),
            'transfers' => $trip->transfers()->count(),
            'sales' => $trip->sales()->count(),
            'expenses' => $trip->expenses()->count(),
            'submissions' => $trip->cashSubmissions()->count(),
            'payments' => $trip->customerPayments()->count(),
        ];

        $this->seed(OperationProcessSeeder::class);

        $trip->refresh();
        $this->assertSame($counts, [
            'trips' => Trip::query()->count(),
            'transfers' => $trip->transfers()->count(),
            'sales' => $trip->sales()->count(),
            'expenses' => $trip->expenses()->count(),
            'submissions' => $trip->cashSubmissions()->count(),
            'payments' => $trip->customerPayments()->count(),
        ]);
    }
}
