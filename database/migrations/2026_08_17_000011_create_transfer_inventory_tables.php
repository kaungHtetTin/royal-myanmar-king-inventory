<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('representative_inventories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sales_representative_id')->constrained()->restrictOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('quantity')->default(0);
            $table->timestamps();
            $table->unique(['sales_representative_id', 'product_id'], 'representative_inventory_unique');
            $table->index(['product_id', 'quantity']);
        });

        Schema::create('warehouse_transfers', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('source_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('destination_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->string('status', 20)->default('draft')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('dispatched_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('dispatched_at')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason', 500)->nullable();
            $table->foreignId('reversed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('reversed_at')->nullable();
            $table->string('reversal_reason', 500)->nullable();
            $table->timestamps();
            $table->index(['source_warehouse_id', 'destination_warehouse_id'], 'warehouse_transfer_route_index');
        });

        Schema::create('warehouse_transfer_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('warehouse_transfer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('quantity');
            $table->timestamps();
            $table->unique(['warehouse_transfer_id', 'product_id'], 'warehouse_transfer_item_unique');
        });

        Schema::create('representative_transfers', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('source_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->foreignId('sales_representative_id')->constrained()->restrictOnDelete();
            $table->string('status', 20)->default('draft')->index();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            $table->foreignId('dispatched_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('dispatched_at')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason', 500)->nullable();
            $table->foreignId('reversed_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('reversed_at')->nullable();
            $table->string('reversal_reason', 500)->nullable();
            $table->timestamps();
            $table->index(['source_warehouse_id', 'sales_representative_id'], 'representative_transfer_route_index');
        });

        Schema::create('representative_transfer_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('representative_transfer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedSmallInteger('quantity');
            $table->timestamps();
            $table->unique(['representative_transfer_id', 'product_id'], 'representative_transfer_item_unique');
        });

        Schema::create('in_transit_inventories', function (Blueprint $table): void {
            $table->id();
            $table->string('transfer_type', 40);
            $table->unsignedBigInteger('transfer_id');
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('quantity')->default(0);
            $table->timestamps();
            $table->unique(['transfer_type', 'transfer_id', 'product_id'], 'in_transit_inventory_unique');
            $table->index(['product_id', 'quantity']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE representative_inventories ADD CONSTRAINT representative_quantity_max CHECK (quantity <= 100)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('in_transit_inventories');
        Schema::dropIfExists('representative_transfer_items');
        Schema::dropIfExists('representative_transfers');
        Schema::dropIfExists('warehouse_transfer_items');
        Schema::dropIfExists('warehouse_transfers');
        Schema::dropIfExists('representative_inventories');
    }
};
