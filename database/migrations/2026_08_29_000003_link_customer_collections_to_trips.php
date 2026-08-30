<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_payments', function (Blueprint $table): void {
            $table->foreignId('trip_id')->nullable()->after('id')->constrained()->restrictOnDelete();
            $table->foreignId('sales_representative_id')->nullable()->after('trip_id')->constrained()->restrictOnDelete();
            $table->index(['trip_id', 'status', 'created_at'], 'customer_payments_trip_index');
        });
    }

    public function down(): void
    {
        Schema::table('customer_payments', function (Blueprint $table): void {
            $table->dropIndex('customer_payments_trip_index');
            $table->dropConstrainedForeignId('sales_representative_id');
            $table->dropConstrainedForeignId('trip_id');
        });
    }
};
