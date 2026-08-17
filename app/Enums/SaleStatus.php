<?php

namespace App\Enums;

enum SaleStatus: string
{
    case Draft = 'draft';
    case Posted = 'posted';
    case Voided = 'voided';
}
