<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\CustomerCreditTransaction;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeCashTransaction;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Phase6SettlementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_pending_submission_reserves_available_amount_without_reducing_hold(): void
    {
        [$representative, $repUser] = $this->representativeFixture(500000);
        $response = $this->actingAs($repUser)->command('/api/sales/cash-submissions', 'submit-400', ['amount' => 400000, 'notes' => 'Handed to office cashier.'])
            ->assertCreated()->assertJsonPath('data.reference', 'CSB-000001')->assertJsonPath('data.status', 'pending');
        $this->assertSame(500000, $this->cashHold($representative));
        $this->getJson('/api/sales/cash-hold')->assertOk()->assertJsonPath('cash_hold', 500000)->assertJsonPath('pending_submissions', 400000)->assertJsonPath('available_to_submit', 100000);
        $this->command('/api/sales/cash-submissions', 'submit-400', ['amount' => 400000])->assertCreated()->assertJsonPath('data.id', $response->json('data.id'));
        $this->command('/api/sales/cash-submissions', 'submit-over', ['amount' => 100001])->assertConflict()->assertJsonPath('code', 'INSUFFICIENT_REPRESENTATIVE_CASH');
        $this->assertDatabaseCount('cash_submissions', 1);
        $this->assertDatabaseCount('representative_cash_transactions', 1);
    }

    public function test_office_confirmation_reduces_hold_exactly_once_and_reconciles_ledger(): void
    {
        [$representative, $repUser, $warehouse] = $this->representativeFixture(500000);
        $submissionId = $this->actingAs($repUser)->command('/api/sales/cash-submissions', 'submit-confirm', ['amount' => 400000])->assertCreated()->json('data.id');
        $admin = $this->officeUser($warehouse, PermissionName::CashView, PermissionName::CashConfirm);
        $this->actingAs($admin)->command("/api/admin/cash-submissions/{$submissionId}/confirm", 'confirm-once')->assertOk()->assertJsonPath('data.status', 'confirmed');
        $this->assertSame(100000, $this->cashHold($representative));
        $this->assertDatabaseHas('representative_cash_transactions', ['transaction_type' => 'cash_submission_confirmed', 'amount_delta' => -400000, 'source_id' => $submissionId]);
        $this->command("/api/admin/cash-submissions/{$submissionId}/confirm", 'confirm-once')->assertOk();
        $this->command("/api/admin/cash-submissions/{$submissionId}/confirm", 'confirm-twice')->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
        $this->assertSame(100000, $this->cashHold($representative));
        $this->assertSame(100000, (int) RepresentativeCashTransaction::query()->where('sales_representative_id', $representative->id)->sum('amount_delta'));
    }

    public function test_pending_cancel_and_confirmed_reversal_are_controlled_compensating_actions(): void
    {
        [$representative, $repUser, $warehouse] = $this->representativeFixture(500000);
        $pendingId = $this->actingAs($repUser)->command('/api/sales/cash-submissions', 'submit-cancel', ['amount' => 100000])->assertCreated()->json('data.id');
        $this->command("/api/sales/cash-submissions/{$pendingId}/cancel", 'cancel-own', ['reason' => 'Office handover did not happen.'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $confirmedId = $this->command('/api/sales/cash-submissions', 'submit-reverse', ['amount' => 200000])->assertCreated()->json('data.id');
        $admin = $this->officeUser($warehouse, PermissionName::CashConfirm, PermissionName::CashReverse);
        $this->actingAs($admin)->command("/api/admin/cash-submissions/{$confirmedId}/confirm", 'confirm-reverse')->assertOk();
        $this->command("/api/admin/cash-submissions/{$confirmedId}/reverse", 'reverse-confirmed', ['reason' => 'Office confirmation entered against the wrong handover.'])->assertOk()->assertJsonPath('data.status', 'reversed');
        $this->assertSame(500000, $this->cashHold($representative));
        $transactions = RepresentativeCashTransaction::query()->where('source_id', $confirmedId)->orderBy('id')->get();
        $this->assertSame([-200000, 200000], $transactions->pluck('amount_delta')->all());
        $this->assertSame($transactions[0]->id, $transactions[1]->reversal_of_id);
    }

    public function test_representative_cash_is_owned_and_office_actions_are_scoped_and_separated(): void
    {
        [, $repUser] = $this->representativeFixture(500000);
        [, $otherUser, $otherWarehouse] = $this->representativeFixture(200000);
        $foreignId = $this->actingAs($otherUser)->command('/api/sales/cash-submissions', 'other-submit', ['amount' => 100000])->assertCreated()->json('data.id');
        $this->actingAs($repUser)->getJson('/api/sales/cash-submissions')->assertOk()->assertJsonCount(0, 'data');
        $this->command("/api/sales/cash-submissions/{$foreignId}/cancel", 'foreign-cancel', ['reason' => 'Not mine.'])->assertForbidden();
        $viewer = $this->officeUser($otherWarehouse, PermissionName::CashView);
        $this->actingAs($viewer)->getJson('/api/admin/cash-submissions')->assertOk()->assertJsonCount(1, 'data');
        $this->command("/api/admin/cash-submissions/{$foreignId}/confirm", 'viewer-confirm')->assertForbidden();
        $wrongWarehouse = Warehouse::factory()->create();
        $confirmer = $this->officeUser($wrongWarehouse, PermissionName::CashConfirm);
        $this->actingAs($confirmer)->command("/api/admin/cash-submissions/{$foreignId}/confirm", 'wrong-scope')->assertForbidden();
    }

    public function test_representative_cash_activity_is_paginated_and_owned(): void
    {
        [$representative, $repUser] = $this->representativeFixture(500000);
        [, $otherUser] = $this->representativeFixture(200000);

        foreach (range(1, 11) as $sequence) {
            RepresentativeCashTransaction::query()->create([
                'sales_representative_id' => $representative->id,
                'transaction_type' => 'cash_sale',
                'amount_delta' => $sequence,
                'source_type' => 'pagination_test',
                'source_id' => $sequence,
                'reference' => sprintf('PAGE-%02d', $sequence),
                'created_by' => $repUser->id,
                'occurred_at' => now(),
            ]);
        }

        $this->actingAs($repUser)->getJson('/api/sales/cash-transactions?page=2&per_page=10')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.total', 12);

        $this->actingAs($otherUser)->getJson('/api/sales/cash-transactions?per_page=10')
            ->assertOk()
            ->assertJsonPath('meta.total', 1);
    }

    public function test_customer_payment_draft_is_neutral_then_post_reduces_outstanding(): void
    {
        [$customer, $warehouse] = $this->customerFixture(500000);
        $admin = $this->officeUser($warehouse, PermissionName::CustomerPaymentView, PermissionName::CustomerPaymentCreate);
        $paymentId = $this->actingAs($admin)->command('/api/admin/customer-payments', 'payment-create', $this->paymentPayload($customer, 400000))->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.received_by.id', $admin->id)->json('data.id');
        $this->assertSame(500000, $this->outstanding($customer));
        $this->assertDatabaseCount('customer_credit_transactions', 1);
        $this->command("/api/admin/customer-payments/{$paymentId}/post", 'payment-post')->assertOk()->assertJsonPath('data.status', 'posted');
        $this->assertSame(100000, $this->outstanding($customer));
        $this->assertDatabaseHas('customer_credit_transactions', ['transaction_type' => 'customer_payment', 'amount_delta' => -400000, 'source_id' => $paymentId]);
        $this->command("/api/admin/customer-payments/{$paymentId}/post", 'payment-post')->assertOk();
        $this->command("/api/admin/customer-payments/{$paymentId}/post", 'payment-post-again')->assertConflict()->assertJsonPath('code', 'INVALID_DOCUMENT_STATE');
    }

    public function test_overpayment_rolls_back_and_void_restores_with_linked_ledger(): void
    {
        [$customer, $warehouse] = $this->customerFixture(500000);
        $admin = $this->officeUser($warehouse, PermissionName::CustomerPaymentCreate, PermissionName::CustomerPaymentVoid);
        $overId = $this->actingAs($admin)->command('/api/admin/customer-payments', 'over-create', $this->paymentPayload($customer, 500001))->assertCreated()->json('data.id');
        $this->command("/api/admin/customer-payments/{$overId}/post", 'over-post')->assertConflict()->assertJsonPath('code', 'INSUFFICIENT_CUSTOMER_CREDIT');
        $this->assertSame(500000, $this->outstanding($customer));
        $this->assertDatabaseHas('customer_payments', ['id' => $overId, 'status' => 'draft']);

        $paymentId = $this->command('/api/admin/customer-payments', 'valid-create', $this->paymentPayload($customer, 300000))->assertCreated()->json('data.id');
        $this->command("/api/admin/customer-payments/{$paymentId}/post", 'valid-post')->assertOk();
        $this->command("/api/admin/customer-payments/{$paymentId}/void", 'valid-void', ['reason' => 'Bank transfer was reversed by the bank.'])->assertOk()->assertJsonPath('data.status', 'voided');
        $this->assertSame(500000, $this->outstanding($customer));
        $transactions = CustomerCreditTransaction::query()->where('source_type', 'customer_payment')->where('source_id', $paymentId)->orderBy('id')->get();
        $this->assertSame([-300000, 300000], $transactions->pluck('amount_delta')->all());
        $this->assertSame($transactions[0]->id, $transactions[1]->reversal_of_id);
        $this->putJson("/api/admin/customer-payments/{$paymentId}", $this->paymentPayload($customer, 1))->assertConflict();
        $this->deleteJson("/api/admin/customer-payments/{$paymentId}")->assertMethodNotAllowed();
    }

    /** @return array{SalesRepresentative, User, Warehouse} */
    private function representativeFixture(int $hold): array
    {
        $warehouse = Warehouse::factory()->create();
        $user = User::factory()->create();
        $user->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::factory()->create(['user_id' => $user->id, 'primary_warehouse_id' => $warehouse->id]);
        RepresentativeCashBalance::query()->create(['sales_representative_id' => $representative->id, 'amount' => $hold]);
        RepresentativeCashTransaction::query()->create(['sales_representative_id' => $representative->id, 'transaction_type' => 'cash_sale', 'amount_delta' => $hold, 'source_type' => 'test', 'source_id' => $representative->id, 'reference' => 'TEST-CASH-'.$representative->id, 'created_by' => $user->id, 'occurred_at' => now()]);

        return [$representative, $user, $warehouse];
    }

    /** @return array{Customer, Warehouse} */
    private function customerFixture(int $outstanding): array
    {
        $warehouse = Warehouse::factory()->create();
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'credit_allowed' => true, 'credit_limit' => $outstanding * 2]);
        CustomerCreditBalance::query()->create(['customer_id' => $customer->id, 'outstanding_amount' => $outstanding]);
        $actor = User::factory()->create();
        CustomerCreditTransaction::query()->create(['customer_id' => $customer->id, 'transaction_type' => 'credit_sale', 'amount_delta' => $outstanding, 'source_type' => 'test', 'source_id' => $customer->id, 'reference' => 'TEST-CREDIT-'.$customer->id, 'created_by' => $actor->id, 'occurred_at' => now()]);

        return [$customer, $warehouse];
    }

    private function officeUser(Warehouse $warehouse, PermissionName ...$permissions): User
    {
        $user = User::factory()->create();
        $user->assignRole(RoleName::OfficeAdmin->value);
        $user->givePermissionTo(collect($permissions)->map->value->all());
        $user->warehouses()->attach($warehouse, ['assigned_by' => $user->id]);

        return $user;
    }

    /** @return array<string, mixed> */
    private function paymentPayload(Customer $customer, int $amount): array
    {
        return ['customer_id' => $customer->id, 'amount' => $amount, 'payment_date' => '2026-08-17', 'payment_method' => 'bank_transfer', 'payment_reference' => 'BANK-991', 'notes' => 'Payment received by finance desk.'];
    }

    private function command(string $uri, string $key, array $payload = [])
    {
        return $this->withHeader('Idempotency-Key', $key)->postJson($uri, $payload);
    }

    private function cashHold(SalesRepresentative $representative): int
    {
        return (int) RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount');
    }

    private function outstanding(Customer $customer): int
    {
        return (int) CustomerCreditBalance::query()->where('customer_id', $customer->id)->value('outstanding_amount');
    }
}
