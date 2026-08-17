<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouses', function (Blueprint $table): void {
            $table->string('region', 100)->nullable()->after('name');
            $table->string('township', 100)->nullable()->after('region');
            $table->string('address', 500)->nullable()->after('township');
            $table->string('phone', 30)->nullable()->after('address');
            $table->text('notes')->nullable()->after('phone');
        });
    }

    public function down(): void
    {
        Schema::table('warehouses', function (Blueprint $table): void {
            $table->dropColumn(['region', 'township', 'address', 'phone', 'notes']);
        });
    }
};
