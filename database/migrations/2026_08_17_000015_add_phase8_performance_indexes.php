<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->index(['is_active', 'name'], 'products_active_name_index');
        });
        Schema::table('customers', function (Blueprint $table): void {
            $table->index(['warehouse_id', 'name'], 'customers_warehouse_name_index');
        });
        Schema::table('sales_representatives', function (Blueprint $table): void {
            $table->index(['primary_warehouse_id', 'name'], 'representatives_warehouse_name_index');
        });
        Schema::table('stock_movements', function (Blueprint $table): void {
            $table->index(['product_id', 'occurred_at'], 'stock_movements_product_date_index');
            $table->index(['from_location_type', 'from_location_id', 'occurred_at'], 'stock_movements_from_date_index');
            $table->index(['to_location_type', 'to_location_id', 'occurred_at'], 'stock_movements_to_date_index');
        });
        Schema::table('sales', function (Blueprint $table): void {
            $table->index(['customer_id', 'status', 'posted_at'], 'sales_customer_status_posted_index');
        });
        Schema::table('cash_submissions', function (Blueprint $table): void {
            $table->index(['warehouse_id', 'status', 'created_at'], 'cash_submission_scope_status_date_index');
        });
        Schema::table('customer_payments', function (Blueprint $table): void {
            $table->index(['warehouse_id', 'status', 'payment_date'], 'customer_payment_scope_status_date_index');
        });
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->index(['event', 'created_at'], 'audit_event_date_index');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', fn (Blueprint $table) => $table->dropIndex('audit_event_date_index'));
        Schema::table('customer_payments', fn (Blueprint $table) => $table->dropIndex('customer_payment_scope_status_date_index'));
        Schema::table('cash_submissions', fn (Blueprint $table) => $table->dropIndex('cash_submission_scope_status_date_index'));
        Schema::table('sales', fn (Blueprint $table) => $table->dropIndex('sales_customer_status_posted_index'));
        Schema::table('stock_movements', function (Blueprint $table): void {
            $table->dropIndex('stock_movements_product_date_index');
            $table->dropIndex('stock_movements_from_date_index');
            $table->dropIndex('stock_movements_to_date_index');
        });
        Schema::table('sales_representatives', fn (Blueprint $table) => $table->dropIndex('representatives_warehouse_name_index'));
        Schema::table('customers', fn (Blueprint $table) => $table->dropIndex('customers_warehouse_name_index'));
        Schema::table('products', fn (Blueprint $table) => $table->dropIndex('products_active_name_index'));
    }
};
