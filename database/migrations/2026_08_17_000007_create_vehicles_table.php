<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $table): void {
            $table->id();
            $table->string('vehicle_number', 50)->unique();
            $table->string('vehicle_type', 50)->index();
            $table->string('brand', 100)->nullable();
            $table->string('model', 100)->nullable();
            $table->foreignId('sales_representative_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->boolean('is_active')->default(true)->index();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};
