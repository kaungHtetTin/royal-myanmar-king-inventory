<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_credit_transactions', function (Blueprint $table): void {
            $table->foreignId('reversal_of_id')->nullable()->after('source_id')->constrained('customer_credit_transactions')->restrictOnDelete();
        });
        Schema::table('representative_cash_transactions', function (Blueprint $table): void {
            $table->foreignId('reversal_of_id')->nullable()->after('source_id')->constrained('representative_cash_transactions')->restrictOnDelete();
        });

        Schema::create('cash_submissions', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('sales_representative_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->string('status', 20)->default('pending')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason', 500)->nullable();
            $table->foreignId('reversed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('reversed_at')->nullable();
            $table->string('reversal_reason', 500)->nullable();
            $table->timestamps();
            $table->index(['sales_representative_id', 'created_at'], 'cash_submission_representative_index');
            $table->index(['warehouse_id', 'created_at']);
        });

        Schema::create('customer_payments', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('amount');
            $table->date('payment_date')->index();
            $table->string('payment_method', 100);
            $table->string('payment_reference', 100)->nullable()->index();
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('draft')->index();
            $table->foreignId('received_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('posted_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('voided_at')->nullable();
            $table->string('void_reason', 500)->nullable();
            $table->timestamps();
            $table->index(['customer_id', 'created_at']);
            $table->index(['warehouse_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_payments');
        Schema::dropIfExists('cash_submissions');
        Schema::table('representative_cash_transactions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('reversal_of_id');
        });
        Schema::table('customer_credit_transactions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('reversal_of_id');
        });
    }
};
