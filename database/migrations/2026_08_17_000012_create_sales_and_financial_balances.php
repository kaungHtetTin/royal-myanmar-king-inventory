<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_credit_balances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('outstanding_amount')->default(0);
            $table->timestamps();
        });

        Schema::create('representative_cash_balances', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sales_representative_id')->unique()->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('amount')->default(0);
            $table->timestamps();
        });

        Schema::create('sales', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('sales_representative_id')->constrained()->restrictOnDelete();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('payment_type', 20)->index();
            $table->unsignedBigInteger('total_amount')->default(0);
            $table->string('status', 20)->default('draft')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('posted_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('voided_at')->nullable();
            $table->string('void_reason', 500)->nullable();
            $table->timestamps();
            $table->index(['warehouse_id', 'created_at']);
            $table->index(['sales_representative_id', 'created_at'], 'sales_representative_created_index');
            $table->index(['customer_id', 'created_at']);
        });

        Schema::create('sale_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('quantity');
            $table->unsignedBigInteger('unit_price');
            $table->unsignedBigInteger('line_total');
            $table->timestamps();
            $table->unique(['sale_id', 'product_id']);
        });

        Schema::create('customer_credit_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('transaction_type', 40)->index();
            $table->bigInteger('amount_delta');
            $table->string('source_type', 50);
            $table->unsignedBigInteger('source_id');
            $table->string('reference', 30)->index();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('occurred_at')->useCurrent()->index();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['source_type', 'source_id', 'transaction_type'], 'customer_credit_source_unique');
            $table->index(['customer_id', 'occurred_at']);
        });

        Schema::create('representative_cash_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sales_representative_id')->constrained()->restrictOnDelete();
            $table->string('transaction_type', 40)->index();
            $table->bigInteger('amount_delta');
            $table->string('source_type', 50);
            $table->unsignedBigInteger('source_id');
            $table->string('reference', 30)->index();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('occurred_at')->useCurrent()->index();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['source_type', 'source_id', 'transaction_type'], 'representative_cash_source_unique');
            $table->index(['sales_representative_id', 'occurred_at'], 'representative_cash_owner_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('representative_cash_transactions');
        Schema::dropIfExists('customer_credit_transactions');
        Schema::dropIfExists('sale_items');
        Schema::dropIfExists('sales');
        Schema::dropIfExists('representative_cash_balances');
        Schema::dropIfExists('customer_credit_balances');
    }
};
