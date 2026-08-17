<?php

namespace App\Enums;

enum RoleName: string
{
    case SuperAdmin = 'super-admin';
    case OfficeAdmin = 'office-admin';
    case SalesRepresentative = 'sales-representative';
}
