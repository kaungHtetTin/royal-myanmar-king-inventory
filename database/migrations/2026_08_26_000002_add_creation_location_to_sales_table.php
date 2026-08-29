<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table): void {
            $table->decimal('creation_latitude', 10, 7)->nullable()->after('notes');
            $table->decimal('creation_longitude', 10, 7)->nullable()->after('creation_latitude');
            $table->unsignedInteger('location_accuracy_meters')->nullable()->after('creation_longitude');
            $table->timestamp('location_captured_at')->nullable()->after('location_accuracy_meters');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table): void {
            $table->dropColumn([
                'creation_latitude',
                'creation_longitude',
                'location_accuracy_meters',
                'location_captured_at',
            ]);
        });
    }
};
