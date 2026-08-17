<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_sequences', function (Blueprint $table): void {
            $table->string('type', 50)->primary();
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
        });

        Schema::create('idempotency_keys', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->restrictOnDelete();
            $table->string('command', 150);
            $table->string('key', 100);
            $table->string('status', 20)->default('processing');
            $table->json('result')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'command', 'key']);
        });

        Schema::create('warehouse_inventories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('quantity')->default(0);
            $table->timestamps();
            $table->unique(['warehouse_id', 'product_id']);
            $table->index(['product_id', 'quantity']);
        });

        Schema::create('stock_imports', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->string('status', 20)->default('draft')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('posted_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('voided_at')->nullable();
            $table->string('void_reason', 500)->nullable();
            $table->timestamps();
        });

        Schema::create('stock_import_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_import_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('quantity');
            $table->timestamps();
            $table->unique(['stock_import_id', 'product_id']);
        });

        Schema::create('stock_adjustments', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('adjustment_type', 20);
            $table->unsignedBigInteger('quantity');
            $table->string('reason', 500);
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('draft')->index();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('posted_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->timestamps();
            $table->index(['warehouse_id', 'product_id']);
        });

        Schema::create('stock_movements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('movement_type', 40)->index();
            $table->string('source_type', 50);
            $table->unsignedBigInteger('source_id');
            $table->string('reference', 30)->index();
            $table->string('from_location_type', 30)->nullable();
            $table->unsignedBigInteger('from_location_id')->nullable();
            $table->string('to_location_type', 30)->nullable();
            $table->unsignedBigInteger('to_location_id')->nullable();
            $table->unsignedBigInteger('quantity');
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('occurred_at')->useCurrent()->index();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['source_type', 'source_id', 'movement_type', 'product_id'], 'stock_movements_source_unique');
            $table->index(['from_location_type', 'from_location_id'], 'stock_movements_from_index');
            $table->index(['to_location_type', 'to_location_id'], 'stock_movements_to_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
        Schema::dropIfExists('stock_adjustments');
        Schema::dropIfExists('stock_import_items');
        Schema::dropIfExists('stock_imports');
        Schema::dropIfExists('warehouse_inventories');
        Schema::dropIfExists('idempotency_keys');
        Schema::dropIfExists('document_sequences');
    }
};
