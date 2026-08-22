<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('business_name')->default('StockFlow');
            $table->string('business_tagline')->nullable();
            $table->string('primary_color', 7)->default('#087f74');
            $table->string('logo_path')->nullable();
            $table->string('favicon_path')->nullable();
            $table->string('business_email')->nullable();
            $table->string('business_phone', 50)->nullable();
            $table->string('business_address', 500)->nullable();
            $table->string('currency_code', 3)->default('MMK');
            $table->string('timezone', 100)->default('Asia/Yangon');
            $table->unsignedInteger('low_stock_threshold')->default(10);
            $table->string('invoice_footer', 500)->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_settings');
    }
};
