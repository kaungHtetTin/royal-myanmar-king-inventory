<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table): void {
            $table->string('promotion_title', 150)->nullable()->after('total_amount');
            $table->unsignedBigInteger('promotion_amount')->default(0)->after('promotion_title');
        });
    }

    public function down(): void
    {
        Schema::table('sales', fn (Blueprint $table) => $table->dropColumn(['promotion_title', 'promotion_amount']));
    }
};
