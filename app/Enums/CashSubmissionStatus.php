<?php

namespace App\Enums;

enum CashSubmissionStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Cancelled = 'cancelled';
    case Reversed = 'reversed';
}
