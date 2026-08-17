<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IdempotencyKey extends Model
{
    protected $fillable = ['user_id', 'command', 'key', 'status', 'result'];

    protected function casts(): array
    {
        return ['result' => 'array'];
    }
}
