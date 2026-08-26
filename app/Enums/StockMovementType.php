<?php

namespace App\Enums;

enum StockMovementType: string
{
    case ImportIn = 'IMPORT_IN';
    case AdjustmentIn = 'ADJUSTMENT_IN';
    case AdjustmentOut = 'ADJUSTMENT_OUT';
    case ReversalIn = 'REVERSAL_IN';
    case ReversalOut = 'REVERSAL_OUT';
    case WarehouseTransferDispatch = 'WAREHOUSE_TRANSFER_DISPATCH';
    case WarehouseTransferReceive = 'WAREHOUSE_TRANSFER_RECEIVE';
    case RepresentativeTransferDispatch = 'REPRESENTATIVE_TRANSFER_DISPATCH';
    case RepresentativeTransferReceive = 'REPRESENTATIVE_TRANSFER_RECEIVE';
    case RepresentativeReturn = 'REPRESENTATIVE_RETURN';
    case SaleOut = 'SALE_OUT';
    case SaleFocOut = 'SALE_FOC_OUT';
    case SaleVoidIn = 'SALE_VOID_IN';
    case SaleFocVoidIn = 'SALE_FOC_VOID_IN';
}
