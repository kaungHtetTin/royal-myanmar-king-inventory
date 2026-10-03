<?php

namespace Tests\Feature;

use App\Console\Commands\ResetTransactions;
use Database\Seeders\OperationProcessSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ResetTransactionsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_and_cancellation_leave_data_unchanged(): void
    {
        $this->seed(OperationProcessSeeder::class);
        $before = $this->snapshot();

        $this->artisan('inventory:reset-transactions --dry-run')->assertSuccessful();
        $this->assertSame($before, $this->snapshot());

        $this->artisan('inventory:reset-transactions')
            ->expectsConfirmation('Delete all operational data and start with zero balances?', false)
            ->assertSuccessful();
        $this->assertSame($before, $this->snapshot());
    }

    public function test_reset_clears_operations_and_preserves_business_data_and_numbering(): void
    {
        $this->seed(OperationProcessSeeder::class);
        $before = $this->snapshot();
        $auditCount = DB::table('audit_logs')->count();

        // Exercise restrictive self-references on both ledgers.
        foreach (['customer_credit_transactions', 'representative_cash_transactions'] as $table) {
            $ids = DB::table($table)->orderBy('id')->pluck('id');
            $this->assertGreaterThan(1, $ids->count());
            DB::table($table)->where('id', $ids[1])->update(['reversal_of_id' => $ids[0]]);
        }

        $this->artisan('inventory:reset-transactions --force')->assertSuccessful();

        foreach (ResetTransactions::TABLES as $table) {
            $this->assertDatabaseCount($table, 0);
        }
        foreach ($before as $table => $rows) {
            if (! in_array($table, ResetTransactions::TABLES, true) && $table !== 'audit_logs') {
                $this->assertSame($rows, DB::table($table)->get()->toJson(), $table);
            }
        }
        $this->assertDatabaseCount('audit_logs', $auditCount + 1);
        $this->assertDatabaseHas('audit_logs', ['event' => 'inventory.transactions_reset']);

        // Existing posting services can create stock and financial balances again.
        $this->seed(OperationProcessSeeder::class);
        $this->assertGreaterThan(0, DB::table('sales')->count());
        $this->assertGreaterThan(0, DB::table('warehouse_inventories')->sum('quantity'));
    }

    public function test_a_failure_rolls_back_deletions_and_ledger_reference_changes(): void
    {
        $this->seed(OperationProcessSeeder::class);
        $ids = DB::table('customer_credit_transactions')->orderBy('id')->pluck('id');
        DB::table('customer_credit_transactions')->where('id', $ids[1])->update(['reversal_of_id' => $ids[0]]);
        $before = $this->snapshot();

        DB::unprepared("CREATE TRIGGER reject_reset_audit BEFORE INSERT ON audit_logs
            WHEN NEW.event = 'inventory.transactions_reset'
            BEGIN SELECT RAISE(ABORT, 'Simulated audit failure'); END");

        $this->artisan('inventory:reset-transactions --force')->assertFailed();
        $this->assertSame($before, $this->snapshot());
    }

    private function snapshot(): array
    {
        $tables = array_merge(ResetTransactions::TABLES, [
            'products', 'product_units', 'region_product_prices', 'customers',
            'warehouses', 'sales_representatives', 'vehicles', 'regions',
            'region_sales_representative', 'user_warehouse', 'users', 'roles',
            'permissions', 'model_has_roles', 'model_has_permissions',
            'role_has_permissions', 'application_settings', 'document_sequences', 'audit_logs',
        ]);

        return collect($tables)->mapWithKeys(fn ($table) => [$table => DB::table($table)->get()->toJson()])->all();
    }
}
