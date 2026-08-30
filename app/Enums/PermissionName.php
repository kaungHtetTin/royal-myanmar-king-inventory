<?php

namespace App\Enums;

enum PermissionName: string
{
    case DashboardView = 'dashboard.view';
    case WarehouseView = 'warehouse.view';
    case WarehouseCreate = 'warehouse.create';
    case WarehouseEdit = 'warehouse.edit';
    case ProductView = 'product.view';
    case ProductCreate = 'product.create';
    case ProductEdit = 'product.edit';
    case InventoryView = 'inventory.view';
    case InventoryImport = 'inventory.import';
    case InventoryAdjust = 'inventory.adjust';
    case WarehouseTransferView = 'warehouse_transfer.view';
    case WarehouseTransferCreate = 'warehouse_transfer.create';
    case WarehouseTransferDispatch = 'warehouse_transfer.dispatch';
    case WarehouseTransferReceive = 'warehouse_transfer.receive';
    case WarehouseTransferReverse = 'warehouse_transfer.reverse';
    case RepresentativeView = 'representative.view';
    case RepresentativeCreate = 'representative.create';
    case RepresentativeEdit = 'representative.edit';
    case RepresentativeStockView = 'representative_stock.view';
    case RepresentativeStockIssue = 'representative_stock.issue';
    case RepresentativeStockReceive = 'representative_stock.receive';
    case TripView = 'trip.view';
    case TripManage = 'trip.manage';
    case TripClose = 'trip.close';
    case TripExpenseCreate = 'trip_expense.create';
    case CustomerView = 'customer.view';
    case CustomerCreate = 'customer.create';
    case CustomerEdit = 'customer.edit';
    case CustomerCreditManage = 'customer.credit_manage';
    case SaleView = 'sale.view';
    case SaleCreate = 'sale.create';
    case SaleVoid = 'sale.void';
    case CashView = 'cash.view';
    case CashSubmit = 'cash.submit';
    case CashConfirm = 'cash.confirm';
    case CashReverse = 'cash.reverse';
    case CustomerPaymentView = 'customer_payment.view';
    case CustomerPaymentCreate = 'customer_payment.create';
    case CustomerPaymentVoid = 'customer_payment.void';
    case VehicleView = 'vehicle.view';
    case VehicleCreate = 'vehicle.create';
    case VehicleEdit = 'vehicle.edit';
    case ReportView = 'report.view';
    case AuditView = 'audit.view';
    case UserManage = 'user.manage';
    case RoleManage = 'role.manage';
}
