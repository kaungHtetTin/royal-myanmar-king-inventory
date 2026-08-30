<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('customers', 'region_id')) {
            Schema::table('customers', function (Blueprint $table): void {
                $table->foreignId('region_id')->nullable()->after('warehouse_id')->constrained()->restrictOnDelete();
                $table->index(['region_id', 'is_active']);
            });
        }

        if (Schema::hasTable('ways') && Schema::hasColumn('customers', 'way_id')) {
            DB::table('customers')->whereNull('region_id')->whereNotNull('way_id')->orderBy('id')->each(
                function ($customer): void {
                    $regionId = DB::table('ways')->where('id', $customer->way_id)->value('region_id');
                    if ($regionId) {
                        DB::table('customers')->where('id', $customer->id)->update(['region_id' => $regionId]);
                    }
                },
            );
        }

        DB::table('customers')->whereNull('region_id')->orderBy('id')->each(function ($customer): void {
            $regionId = DB::table('regions')
                ->where('warehouse_id', $customer->warehouse_id)
                ->when($customer->region, fn ($query, $name) => $query->where('name', $name))
                ->value('id')
                ?? DB::table('regions')->where('warehouse_id', $customer->warehouse_id)->orderBy('id')->value('id');

            if ($regionId) {
                DB::table('customers')->where('id', $customer->id)->update(['region_id' => $regionId]);
            }
        });

        if (Schema::hasColumn('sales', 'way_id')) {
            Schema::table('sales', function (Blueprint $table): void {
                $table->dropForeign(['way_id']);
                $table->dropIndex('sales_way_representative_date');
                $table->dropColumn('way_id');
            });
        }

        if (Schema::hasColumn('customers', 'way_id')) {
            Schema::table('customers', function (Blueprint $table): void {
                $table->dropForeign(['way_id']);
                $table->dropIndex(['way_id', 'is_active']);
                $table->dropColumn('way_id');
            });
        }

        Schema::dropIfExists('ways');
    }

    public function down(): void
    {
        Schema::create('ways', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('region_id')->constrained()->restrictOnDelete();
            $table->string('code', 30)->unique();
            $table->string('name', 100);
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
            $table->unique(['region_id', 'name']);
        });

        foreach (DB::table('regions')->orderBy('id')->get() as $region) {
            DB::table('ways')->insert([
                'region_id' => $region->id,
                'code' => 'WAY-'.str_pad((string) $region->id, 6, '0', STR_PAD_LEFT),
                'name' => $region->name,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        Schema::table('customers', function (Blueprint $table): void {
            $table->foreignId('way_id')->nullable()->after('region_id')->constrained()->restrictOnDelete();
            $table->index(['way_id', 'is_active']);
        });
        Schema::table('sales', function (Blueprint $table): void {
            $table->foreignId('way_id')->nullable()->after('region_id')->constrained()->restrictOnDelete();
            $table->index(['way_id', 'sales_representative_id', 'posted_at'], 'sales_way_representative_date');
        });

        DB::table('customers')->whereNotNull('region_id')->orderBy('id')->each(function ($customer): void {
            $wayId = DB::table('ways')->where('region_id', $customer->region_id)->value('id');
            DB::table('customers')->where('id', $customer->id)->update(['way_id' => $wayId]);
        });
        DB::table('sales')->whereNotNull('region_id')->orderBy('id')->each(function ($sale): void {
            $wayId = DB::table('ways')->where('region_id', $sale->region_id)->value('id');
            DB::table('sales')->where('id', $sale->id)->update(['way_id' => $wayId]);
        });
    }
};
