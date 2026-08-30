<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('application_settings', function (Blueprint $table): void {
            $table->json('payment_methods')->nullable()->after('invoice_footer');
        });

        DB::table('application_settings')->whereNull('payment_methods')->update([
            'payment_methods' => json_encode([
                ['key' => 'cash', 'name' => 'Cash', 'adds_to_cash_hold' => true, 'is_active' => true],
                ['key' => 'banking', 'name' => 'Banking', 'adds_to_cash_hold' => false, 'is_active' => true],
            ]),
        ]);
    }

    public function down(): void
    {
        Schema::table('application_settings', fn (Blueprint $table) => $table->dropColumn('payment_methods'));
    }
};
