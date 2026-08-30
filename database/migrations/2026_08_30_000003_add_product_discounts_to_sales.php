<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->decimal('discount_percentage', 5, 2)->default(0)->after('selling_price');
        });
        Schema::table('sale_items', function (Blueprint $table): void {
            $table->decimal('discount_percentage', 5, 2)->default(0)->after('unit_price');
            $table->unsignedBigInteger('discount_amount')->default(0)->after('discount_percentage');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', fn (Blueprint $table) => $table->dropColumn(['discount_percentage', 'discount_amount']));
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn('discount_percentage'));
    }
};
