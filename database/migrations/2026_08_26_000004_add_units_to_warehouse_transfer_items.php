<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('warehouse_transfer_items', function (Blueprint $table): void {
            $table->foreignId('product_unit_id')->nullable()->after('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('base_quantity')->default(0)->after('quantity');
        });

        DB::table('warehouse_transfer_items')->orderBy('id')->each(function (object $item): void {
            $baseUnitId = DB::table('product_units')
                ->where('product_id', $item->product_id)
                ->where('is_base', true)
                ->value('id');

            DB::table('warehouse_transfer_items')->where('id', $item->id)->update([
                'product_unit_id' => $baseUnitId,
                'base_quantity' => $item->quantity,
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('warehouse_transfer_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('product_unit_id');
            $table->dropColumn('base_quantity');
        });
    }
};
