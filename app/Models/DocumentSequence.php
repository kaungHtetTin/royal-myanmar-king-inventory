<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentSequence extends Model
{
    protected $primaryKey = 'type';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['type', 'next_number'];

    protected function casts(): array
    {
        return ['next_number' => 'integer'];
    }
}
