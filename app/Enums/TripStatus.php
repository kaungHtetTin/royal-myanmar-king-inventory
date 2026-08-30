<?php

namespace App\Enums;

enum TripStatus: string
{
    case Planning = 'planning';
    case Operation = 'operation';
    case Ending = 'ending';
    case Completed = 'completed';
    case Cancelled = 'cancelled';
}
