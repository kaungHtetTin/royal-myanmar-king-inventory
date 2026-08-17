<?php

namespace App\Enums;

enum PaymentType: string
{
    case Cash = 'cash';
    case Credit = 'credit';
}
