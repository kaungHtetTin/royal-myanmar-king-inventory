<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table): void {
            $table->string('payment_method', 100)->nullable()->after('payment_type')->index();
        });

        DB::table('sales')->where('payment_type', 'cash')->update(['payment_method' => 'cash']);
    }

    public function down(): void
    {
        Schema::table('sales', fn (Blueprint $table) => $table->dropColumn('payment_method'));
    }
};
