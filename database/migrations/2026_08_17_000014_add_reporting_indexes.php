<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table): void {
            $table->index(['warehouse_id', 'status', 'posted_at'], 'sales_warehouse_status_posted_index');
            $table->index(['sales_representative_id', 'status', 'posted_at'], 'sales_rep_status_posted_index');
            $table->index(['payment_type', 'status', 'posted_at'], 'sales_payment_status_posted_index');
        });
        Schema::table('warehouse_transfers', function (Blueprint $table): void {
            $table->index(['source_warehouse_id', 'status', 'created_at'], 'warehouse_transfer_source_status_date_index');
            $table->index(['destination_warehouse_id', 'status', 'created_at'], 'warehouse_transfer_destination_status_date_index');
        });
        Schema::table('representative_transfers', function (Blueprint $table): void {
            $table->index(['source_warehouse_id', 'status', 'created_at'], 'representative_transfer_source_status_date_index');
            $table->index(['sales_representative_id', 'status', 'created_at'], 'representative_transfer_rep_status_date_index');
        });
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->index(['actor_id', 'created_at'], 'audit_actor_date_index');
            $table->index(['subject_type', 'subject_id', 'created_at'], 'audit_subject_date_index');
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->dropIndex('audit_actor_date_index');
            $table->dropIndex('audit_subject_date_index');
        });
        Schema::table('representative_transfers', function (Blueprint $table): void {
            $table->dropIndex('representative_transfer_source_status_date_index');
            $table->dropIndex('representative_transfer_rep_status_date_index');
        });
        Schema::table('warehouse_transfers', function (Blueprint $table): void {
            $table->dropIndex('warehouse_transfer_source_status_date_index');
            $table->dropIndex('warehouse_transfer_destination_status_date_index');
        });
        Schema::table('sales', function (Blueprint $table): void {
            $table->dropIndex('sales_warehouse_status_posted_index');
            $table->dropIndex('sales_rep_status_posted_index');
            $table->dropIndex('sales_payment_status_posted_index');
        });
    }
};
