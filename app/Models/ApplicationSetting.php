<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ApplicationSetting extends Model
{
    protected $fillable = [
        'business_name',
        'business_tagline',
        'primary_color',
        'logo_path',
        'favicon_path',
        'business_email',
        'business_phone',
        'business_address',
        'currency_code',
        'timezone',
        'low_stock_threshold',
        'invoice_footer',
        'updated_by',
    ];

    protected $attributes = [
        'business_name' => 'StockFlow',
        'primary_color' => '#087f74',
        'currency_code' => 'MMK',
        'timezone' => 'Asia/Yangon',
        'low_stock_threshold' => 10,
    ];

    protected function casts(): array
    {
        return ['low_stock_threshold' => 'integer'];
    }

    public static function current(): self
    {
        return static::query()->first() ?? new static;
    }
}
