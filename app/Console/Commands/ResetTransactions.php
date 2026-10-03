<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class ResetTransactions extends Command
{
    protected $signature = 'inventory:reset-transactions
        {--dry-run : Preview affected tables and row counts without deleting anything}
        {--force : Skip the interactive deletion confirmation}';

    protected $description = 'Delete all operational transactions and balances while preserving master data';

    // Children precede parents; foreign key enforcement remains enabled.
    public const TABLES = [
        'idempotency_keys',
        'customer_credit_transactions',
        'representative_cash_transactions',
        'stock_movements',
        'in_transit_inventories',
        'trip_expenses',
        'customer_payments',
        'cash_submissions',
        'sale_items',
        'sales',
        'representative_transfer_items',
        'representative_transfers',
        'warehouse_transfer_items',
        'warehouse_transfers',
        'stock_import_items',
        'stock_imports',
        'stock_adjustments',
        'trips',
        'warehouse_inventories',
        'representative_inventories',
        'customer_credit_balances',
        'representative_cash_balances',
    ];

    public function handle(): int
    {
        $connection = DB::connection();
        $this->warn('This permanently deletes ALL transactions, stock, customer debt, and representative cash.');
        $this->line('Database: '.$connection->getDatabaseName());
        $this->line('Master data, assignments, users, settings, audit logs, and document numbering are preserved.');

        try {
            $counts = [];
            foreach (self::TABLES as $table) {
                $counts[$table] = $connection->table($table)->count();
            }
            $this->table(['Table', 'Rows to delete'], collect($counts)
                ->map(fn ($count, $table) => [$table, $count])->values()->all());

            if ($this->option('dry-run')) {
                $this->info('Preview only. No data was changed.');

                return self::SUCCESS;
            }

            $this->warn('Back up the database and stop web/queue writes before continuing (php artisan down).');
            if (! $this->option('force') && ! $this->confirm('Delete all operational data and start with zero balances?', false)) {
                $this->info('Reset cancelled. No data was changed.');

                return self::SUCCESS;
            }

            $deleted = $connection->transaction(function () use ($connection): array {
                // Reversal entries reference other entries in the same ledger.
                foreach (['customer_credit_transactions', 'representative_cash_transactions'] as $table) {
                    $connection->table($table)->whereNotNull('reversal_of_id')->update(['reversal_of_id' => null]);
                }

                $deleted = [];
                foreach (self::TABLES as $table) {
                    $deleted[$table] = $connection->table($table)->delete();
                }

                $connection->table('audit_logs')->insert([
                    'event' => 'inventory.transactions_reset',
                    'metadata' => json_encode(['deleted_rows' => $deleted, 'opening_balances' => false], JSON_THROW_ON_ERROR),
                    'created_at' => now(),
                ]);

                return $deleted;
            });

            $this->info('Reset complete. Deleted '.array_sum($deleted).' rows. Stock, debt, and cash now start at zero.');

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error('Reset failed: '.$exception->getMessage());

            return self::FAILURE;
        }
    }
}
