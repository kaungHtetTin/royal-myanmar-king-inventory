<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('representative_transfers', function (Blueprint $table): void {
            $table->string('direction', 20)->default('issue')->after('reference')->index();
        });
    }

    public function down(): void
    {
        Schema::table('representative_transfers', function (Blueprint $table): void {
            $table->dropColumn('direction');
        });
    }
};
