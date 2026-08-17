<?php

namespace App\Enums;

enum TransferStatus: string
{
    case Draft = 'draft';
    case Dispatched = 'dispatched';
    case Received = 'received';
    case Cancelled = 'cancelled';
    case Reversed = 'reversed';
}
