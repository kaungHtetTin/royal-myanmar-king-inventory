<?php

namespace App\Enums;

enum CustomerPaymentStatus: string
{
    case Draft = 'draft';
    case Posted = 'posted';
    case Voided = 'voided';
}
