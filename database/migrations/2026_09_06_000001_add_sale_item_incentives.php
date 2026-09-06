<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table): void {
            $table->unsignedBigInteger('cashback_amount')->default(0);
            $table->string('promotion_title', 150)->nullable();
            $table->unsignedBigInteger('promotion_amount')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', fn (Blueprint $table) => $table->dropColumn(['cashback_amount', 'promotion_title', 'promotion_amount']));
    }
};
