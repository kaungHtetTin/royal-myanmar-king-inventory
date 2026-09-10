<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', fn (Blueprint $table) => $table->unsignedBigInteger('cashback_amount')->default(0)->after('total_amount'));
        DB::table('sales')->orderBy('id')->each(function ($sale): void {
            $cashback = (int) DB::table('sale_items')->where('sale_id', $sale->id)->sum('cashback_amount');
            DB::table('sales')->where('id', $sale->id)->update(['cashback_amount' => $cashback]);
            DB::table('sale_items')->where('sale_id', $sale->id)->update(['line_total' => DB::raw('line_total + cashback_amount')]);
        });
        Schema::table('sale_items', fn (Blueprint $table) => $table->dropColumn('cashback_amount'));
    }

    public function down(): void
    {
        Schema::table('sale_items', fn (Blueprint $table) => $table->unsignedBigInteger('cashback_amount')->default(0)->after('discount_amount'));
        Schema::table('sales', fn (Blueprint $table) => $table->dropColumn('cashback_amount'));
    }
};
