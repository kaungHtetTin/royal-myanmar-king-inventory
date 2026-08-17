<?php

namespace App\Services;

use App\Models\DocumentSequence;

class DocumentReferenceGenerator
{
    public function next(string $type, string $prefix): string
    {
        DocumentSequence::query()->insertOrIgnore([
            'type' => $type,
            'next_number' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $sequence = DocumentSequence::query()->whereKey($type)->lockForUpdate()->firstOrFail();
        $number = $sequence->next_number;
        $sequence->update(['next_number' => $number + 1]);

        return sprintf('%s-%06d', $prefix, $number);
    }
}
