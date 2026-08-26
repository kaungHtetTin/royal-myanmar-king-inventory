<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('regions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('warehouse_id')->constrained()->restrictOnDelete();
            $table->string('name', 100);
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
            $table->unique(['warehouse_id', 'name']);
        });

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

        Schema::create('region_sales_representative', function (Blueprint $table): void {
            $table->foreignId('region_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sales_representative_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['region_id', 'sales_representative_id'], 'region_representative_primary');
        });

        Schema::create('product_units', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('name', 50);
            $table->unsignedBigInteger('conversion_factor')->default(1);
            $table->string('barcode', 100)->nullable()->unique();
            $table->boolean('is_base')->default(false);
            $table->boolean('is_default_selling')->default(false);
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
            $table->unique(['product_id', 'name']);
        });

        Schema::create('region_product_prices', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('region_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_unit_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('price');
            $table->timestamps();
            $table->unique(['region_id', 'product_unit_id']);
            $table->index(['product_unit_id', 'region_id']);
        });

        Schema::table('customers', function (Blueprint $table): void {
            $table->foreignId('way_id')->nullable()->after('warehouse_id')->constrained()->restrictOnDelete();
            $table->index(['way_id', 'is_active']);
        });
        Schema::table('sales', function (Blueprint $table): void {
            $table->foreignId('region_id')->nullable()->after('warehouse_id')->constrained()->restrictOnDelete();
            $table->foreignId('way_id')->nullable()->after('region_id')->constrained()->restrictOnDelete();
            $table->index(['way_id', 'sales_representative_id', 'posted_at'], 'sales_way_representative_date');
        });
        Schema::table('sale_items', function (Blueprint $table): void {
            $table->foreignId('product_unit_id')->nullable()->after('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('base_quantity')->default(0)->after('quantity');
            $table->foreignId('foc_product_unit_id')->nullable()->after('line_total')->constrained('product_units')->restrictOnDelete();
            $table->unsignedBigInteger('foc_quantity')->default(0)->after('foc_product_unit_id');
            $table->unsignedBigInteger('foc_base_quantity')->default(0)->after('foc_quantity');
        });
        Schema::table('representative_transfer_items', function (Blueprint $table): void {
            $table->foreignId('product_unit_id')->nullable()->after('product_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('base_quantity')->default(0)->after('quantity');
            $table->foreignId('foc_product_unit_id')->nullable()->after('base_quantity')->constrained('product_units')->restrictOnDelete();
            $table->unsignedBigInteger('foc_quantity')->default(0)->after('foc_product_unit_id');
            $table->unsignedBigInteger('foc_base_quantity')->default(0)->after('foc_quantity');
        });
        Schema::table('representative_inventories', function (Blueprint $table): void {
            $table->unsignedBigInteger('foc_quantity')->default(0)->after('quantity');
        });

        $this->migrateLegacyLocations();
        $this->migrateLegacyUnitsAndPrices();

        if (DB::getDriverName() === 'mysql') {
            try {
                DB::statement('ALTER TABLE representative_inventories DROP CHECK representative_quantity_max');
            } catch (Throwable) {
                try {
                    DB::statement('ALTER TABLE representative_inventories DROP CONSTRAINT representative_quantity_max');
                } catch (Throwable) {
                    // The constraint may not exist on older installations.
                }
            }
            DB::statement('ALTER TABLE representative_inventories MODIFY quantity BIGINT UNSIGNED NOT NULL DEFAULT 0');
            DB::statement('ALTER TABLE representative_transfer_items MODIFY quantity BIGINT UNSIGNED NOT NULL');
        }
    }

    private function migrateLegacyLocations(): void
    {
        $wayNumber = 1;
        foreach (DB::table('warehouses')->orderBy('id')->get() as $warehouse) {
            $names = collect([$warehouse->region])
                ->merge(DB::table('customers')->where('warehouse_id', $warehouse->id)->pluck('region'))
                ->merge(DB::table('sales_representatives')->where('primary_warehouse_id', $warehouse->id)->pluck('region'))
                ->filter(fn ($name) => trim((string) $name) !== '')
                ->map(fn ($name) => trim((string) $name))->unique()->values();
            if ($names->isEmpty()) {
                $names = collect([$warehouse->name.' Region']);
            }

            $regions = collect();
            foreach ($names as $name) {
                $regionId = DB::table('regions')->insertGetId([
                    'warehouse_id' => $warehouse->id, 'name' => $name, 'is_active' => true,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                $regions->put(mb_strtolower($name), $regionId);
            }

            foreach (DB::table('customers')->where('warehouse_id', $warehouse->id)->orderBy('id')->get() as $customer) {
                $regionId = $regions->get(mb_strtolower(trim((string) $customer->region))) ?? $regions->first();
                $wayName = trim((string) $customer->township) ?: 'Default Way';
                $wayId = DB::table('ways')->where('region_id', $regionId)->where('name', $wayName)->value('id');
                if (! $wayId) {
                    $wayId = DB::table('ways')->insertGetId([
                        'region_id' => $regionId,
                        'code' => 'WAY-'.str_pad((string) $wayNumber++, 6, '0', STR_PAD_LEFT),
                        'name' => $wayName, 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
                DB::table('customers')->where('id', $customer->id)->update(['way_id' => $wayId]);
            }

            foreach ($regions as $regionId) {
                if (! DB::table('ways')->where('region_id', $regionId)->exists()) {
                    DB::table('ways')->insert([
                        'region_id' => $regionId,
                        'code' => 'WAY-'.str_pad((string) $wayNumber++, 6, '0', STR_PAD_LEFT),
                        'name' => 'Default Way', 'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
            }

            foreach (DB::table('sales_representatives')->where('primary_warehouse_id', $warehouse->id)->get() as $representative) {
                $regionId = $regions->get(mb_strtolower(trim((string) $representative->region))) ?? $regions->first();
                DB::table('region_sales_representative')->insertOrIgnore([
                    'region_id' => $regionId, 'sales_representative_id' => $representative->id,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }

        foreach (DB::table('sales')->get() as $sale) {
            $wayId = DB::table('customers')->where('id', $sale->customer_id)->value('way_id');
            $regionId = $wayId ? DB::table('ways')->where('id', $wayId)->value('region_id') : null;
            DB::table('sales')->where('id', $sale->id)->update(['way_id' => $wayId, 'region_id' => $regionId]);
        }
    }

    private function migrateLegacyUnitsAndPrices(): void
    {
        $regionIds = DB::table('regions')->pluck('id');
        foreach (DB::table('products')->orderBy('id')->get() as $product) {
            $unitId = DB::table('product_units')->insertGetId([
                'product_id' => $product->id, 'name' => $product->unit, 'conversion_factor' => 1,
                'barcode' => $product->barcode, 'is_base' => true, 'is_default_selling' => true,
                'is_active' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
            foreach ($regionIds as $regionId) {
                DB::table('region_product_prices')->insert([
                    'region_id' => $regionId, 'product_unit_id' => $unitId, 'price' => $product->selling_price,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            DB::table('sale_items')->where('product_id', $product->id)->update([
                'product_unit_id' => $unitId, 'base_quantity' => DB::raw('quantity'),
            ]);
            DB::table('representative_transfer_items')->where('product_id', $product->id)->update([
                'product_unit_id' => $unitId, 'base_quantity' => DB::raw('quantity'),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('representative_inventories', fn (Blueprint $table) => $table->dropColumn('foc_quantity'));
        Schema::table('representative_transfer_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('foc_product_unit_id');
            $table->dropConstrainedForeignId('product_unit_id');
            $table->dropColumn(['base_quantity', 'foc_quantity', 'foc_base_quantity']);
        });
        Schema::table('sale_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('foc_product_unit_id');
            $table->dropConstrainedForeignId('product_unit_id');
            $table->dropColumn(['base_quantity', 'foc_quantity', 'foc_base_quantity']);
        });
        Schema::table('sales', function (Blueprint $table): void {
            $table->dropIndex('sales_way_representative_date');
            $table->dropConstrainedForeignId('way_id');
            $table->dropConstrainedForeignId('region_id');
        });
        Schema::table('customers', fn (Blueprint $table) => $table->dropConstrainedForeignId('way_id'));
        Schema::dropIfExists('region_product_prices');
        Schema::dropIfExists('product_units');
        Schema::dropIfExists('region_sales_representative');
        Schema::dropIfExists('ways');
        Schema::dropIfExists('regions');
    }
};
