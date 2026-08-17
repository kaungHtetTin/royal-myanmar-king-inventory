<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_representatives', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 30)->unique();
            $table->foreignId('user_id')->unique()->constrained()->restrictOnDelete();
            $table->foreignId('primary_warehouse_id')->constrained('warehouses')->restrictOnDelete();
            $table->string('name');
            $table->string('phone', 50)->nullable();
            $table->string('email')->nullable();
            $table->string('region')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_representatives');
    }
};
