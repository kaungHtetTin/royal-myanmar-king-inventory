<?php

namespace App\Enums;

enum InventoryDocumentStatus: string
{
    case Draft = 'draft';
    case Posted = 'posted';
    case Voided = 'voided';
}
