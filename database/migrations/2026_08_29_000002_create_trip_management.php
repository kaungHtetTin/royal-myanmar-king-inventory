<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trips', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->string('title', 150);
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('region_id')->constrained()->restrictOnDelete();
            $table->foreignId('sales_representative_id')->constrained()->restrictOnDelete();
            $table->foreignId('vehicle_id')->constrained()->restrictOnDelete();
            $table->string('status', 20)->default('planning')->index();
            $table->unsignedBigInteger('opening_cash_balance')->default(0);
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('started_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->foreignId('ending_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('ending_at')->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->string('completion_notes', 1000)->nullable();
            $table->bigInteger('stock_variance_units')->default(0);
            $table->bigInteger('cash_variance_amount')->default(0);
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason', 500)->nullable();
            $table->timestamps();
            $table->index(['sales_representative_id', 'status'], 'trips_representative_status_index');
            $table->index(['warehouse_id', 'created_at']);
            $table->index(['region_id', 'created_at']);
        });

        Schema::create('trip_expenses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('trip_id')->constrained()->cascadeOnDelete();
            $table->string('description', 200);
            $table->unsignedBigInteger('amount');
            $table->timestamp('spent_at');
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->index(['trip_id', 'spent_at']);
        });

        Schema::table('representative_transfers', function (Blueprint $table): void {
            $table->foreignId('trip_id')->nullable()->after('id')->constrained()->restrictOnDelete();
            $table->index(['trip_id', 'direction', 'status'], 'representative_transfers_trip_index');
        });
        Schema::table('sales', function (Blueprint $table): void {
            $table->foreignId('trip_id')->nullable()->after('id')->constrained()->restrictOnDelete();
            $table->index(['trip_id', 'status', 'posted_at'], 'sales_trip_status_date_index');
        });
        Schema::table('cash_submissions', function (Blueprint $table): void {
            $table->foreignId('trip_id')->nullable()->after('id')->constrained()->restrictOnDelete();
            $table->index(['trip_id', 'status', 'created_at'], 'cash_submissions_trip_index');
        });
    }

    public function down(): void
    {
        Schema::table('cash_submissions', function (Blueprint $table): void {
            $table->dropIndex('cash_submissions_trip_index');
            $table->dropConstrainedForeignId('trip_id');
        });
        Schema::table('sales', function (Blueprint $table): void {
            $table->dropIndex('sales_trip_status_date_index');
            $table->dropConstrainedForeignId('trip_id');
        });
        Schema::table('representative_transfers', function (Blueprint $table): void {
            $table->dropIndex('representative_transfers_trip_index');
            $table->dropConstrainedForeignId('trip_id');
        });
        Schema::dropIfExists('trip_expenses');
        Schema::dropIfExists('trips');
    }
};
