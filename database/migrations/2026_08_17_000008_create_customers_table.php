<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->string('code', 50)->unique();
            $table->string('name');
            $table->string('customer_type', 100)->nullable()->index();
            $table->string('phone', 50)->nullable();
            $table->string('region', 100)->nullable()->index();
            $table->string('township', 100)->nullable();
            $table->string('address', 500)->nullable();
            $table->boolean('credit_allowed')->default(false)->index();
            $table->unsignedBigInteger('credit_limit')->default(0);
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();

            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
