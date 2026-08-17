# Stock & Inventory Management System
## Software Requirements Specification (SRS)

**Version:** 1.0  
**Date:** 17 August 2026  
**Technology Stack:** Laravel + React + Vite  
**Application Type:** Single Page Application (SPA) + Progressive Web App (PWA)

---

# 1. Introduction

## 1.1 Purpose

This document defines the software requirements for a **Stock and Inventory Management System** designed for a distribution company operating:

- 50+ products
- Multiple warehouses
- Hundreds of sales representatives
- Multiple office administrators
- Multiple regions and locations
- Cash and credit customer sales

The application is intended to be operationally simple.

The system is **not intended to be a full ERP system**.

Most modules will follow simple CRUD principles.

Strict transactional controls are required only where necessary, especially for:

- Stock imports
- Warehouse stock
- Warehouse-to-warehouse transfers
- Warehouse-to-sales-representative transfers
- Sales representative stock
- Customer sales
- Customer credit
- Sales representative cash hold
- Cash settlement
- Stock adjustments

---

# 2. Business Overview

The company imports products from foreign countries and distributes them through warehouses and sales representatives.

The system does not manage the foreign purchasing/import ordering process.

The application starts managing the stock after products arrive at a company warehouse.

The primary business flow is:

```text
Foreign Import
     ↓
Stock Import / Stock Entry
     ↓
Warehouse
     ↓
Sales Representative
     ↓
Customer
```

The system must also support:

```text
Warehouse A
     ↓
Warehouse B
```

Customers may include:

- Retail shops
- Distributors
- Businesses
- End users

All of these will be managed under a common **Customer** module.

---

# 3. Project Objectives

The application must enable management to know:

1. Current stock in every warehouse.
2. Current stock held by every sales representative.
3. Products currently being transferred.
4. Current cash held by every sales representative.
5. Daily, weekly and monthly sales.
6. Cash versus credit sales.
7. Customer outstanding credit.
8. Customer credit limits.
9. Complete stock movement history.
10. Which administrator performed each important transaction.

---

# 4. Application Structure

The system will contain two main application sections.

```text
Application
│
├── Office Admin Dashboard
│
└── Sales Representative App
```

Both applications may use:

- The same Laravel backend
- The same database
- The same authentication system
- The same API infrastructure

but must have separate routes, layouts and permissions.

---

# 5. Routing Structure

## 5.1 Office Admin

Example frontend routes:

```text
/admin/login
/admin/dashboard

/admin/warehouses
/admin/products
/admin/inventory
/admin/transfers
/admin/sales
/admin/customers
/admin/representatives
/admin/cash
/admin/vehicles
/admin/reports
/admin/users
/admin/roles
/admin/settings
```

---

## 5.2 Sales Representative

Example routes:

```text
/sales/login
/sales/dashboard

/sales/my-stock
/sales/receiving
/sales/customers
/sales/new-sale
/sales/sales-history
/sales/cash-hold
/sales/cash-submissions
```

---

# 6. User Types

The initial system will have three primary user categories.

## 6.1 Super Admin

The Super Admin has unrestricted system access.

The Super Admin can:

- Access every warehouse
- View all inventory
- View all representatives
- Manage users
- Manage roles
- Manage permissions
- View all cash holdings
- Manage customer credit
- Perform stock adjustments
- Access all reports
- Manage system configuration

Super Admin warehouse access must not be restricted by warehouse assignment.

---

# 6.2 Office Admin

Office administrators can be assigned to one or more warehouses.

Example:

```text
Admin A
→ Yangon Warehouse

Admin B
→ Mandalay Warehouse

Admin C
→ Yangon Warehouse
→ Naypyidaw Warehouse
```

An office administrator must only access warehouse-related information allowed by:

1. Their role permissions.
2. Their warehouse assignments.

Authorization must be enforced by the Laravel backend and must not depend only on the React UI.

---

# 6.3 Sales Representative

A Sales Representative can access only information related to themselves.

They can:

- View their stock
- Confirm stock receiving
- View pending stock
- Create customer sales
- View their sales
- View their cash hold
- Initiate cash submissions
- View customers allowed for sales

They cannot:

- Modify their own stock manually
- Change customer credit limits
- Change warehouse inventory
- Change product master information
- Access another representative's inventory
- Access another representative's cash hold
- Manage roles or permissions

---

# 7. Authentication System

## 7.1 Requirements

The system must support secure login/logout functionality.

Authentication fields may include:

- Username or email
- Password

Each account shall contain:

- User
- Role
- Status
- Associated representative, if applicable
- Assigned warehouses, if applicable

---

## 7.2 User Status

Users should support:

```text
Active
Inactive
```

Inactive users must not be able to log in.

Historical transactions created by inactive users must remain available.

---

## 7.3 Session Security

The SPA should use secure Laravel authentication such as Laravel Sanctum.

The backend must validate authentication and authorization for every protected API endpoint.

---

# 8. Office Admin Dashboard

The admin dashboard should present business information based on the administrator's accessible warehouses.

## 8.1 Dashboard Summary

Possible dashboard cards:

- Total warehouse stock
- Number of products
- Number of active representatives
- Today's sales
- Today's cash sales
- Today's credit sales
- Total customer outstanding credit
- Total cash currently held by representatives
- Pending warehouse transfers
- Pending representative stock receiving

---

## 8.2 Warehouse Filter

Authorized administrators should be able to filter dashboard information by warehouse.

Example:

```text
[ All Accessible Warehouses ▼ ]
```

Super Admin can select every warehouse.

Normal administrators can only select their assigned warehouses.

---

# 9. Warehouse Management System

## 9.1 Warehouse CRUD

Authorized users can:

- Create warehouse
- View warehouse
- Edit warehouse
- Activate/deactivate warehouse

Warehouses containing transactions should not normally be permanently deleted.

---

## 9.2 Warehouse Information

Recommended fields:

| Field | Description |
|---|---|
| Code | Unique warehouse code |
| Name | Warehouse name |
| Region | State/Division/Region |
| Township | Township/location |
| Address | Warehouse address |
| Phone | Contact number |
| Status | Active/Inactive |
| Notes | Optional |

---

## 9.3 Warehouse Inventory

Every warehouse maintains its own product balances.

Example:

| Product | Yangon | Mandalay | Naypyidaw |
|---|---:|---:|---:|
| Product A | 4,500 | 1,200 | 950 |
| Product B | 2,300 | 750 | 300 |
| Product C | 900 | 650 | 1,100 |

Inventory must be tracked separately for every warehouse.

---

# 10. Product Management

## 10.1 Product CRUD

Authorized administrators can:

- Create product
- Edit product
- View product
- Activate/deactivate product

Products with historical transactions must not normally be permanently deleted.

---

## 10.2 Recommended Product Fields

| Field | Description |
|---|---|
| SKU | Unique product identifier |
| Product Name | Required |
| Category | Optional |
| Unit | pcs, boxes, bottles, etc. |
| Selling Price | Default selling price |
| Barcode | Optional |
| Description | Optional |
| Status | Active/Inactive |

---

# 11. Stock Import / Stock Entry

The application does not manage international purchasing.

When imported products physically arrive at a warehouse, an administrator creates a **Stock Import** transaction.

Example:

```text
Stock Import IMP-000125

Warehouse: Yangon Main Warehouse

Product A       5,000
Product B       2,000
Product C       1,500
```

When posted:

```text
Warehouse Stock
Product A += 5,000
Product B += 2,000
Product C += 1,500
```

---

# 12. Stock Import Status

Recommended statuses:

```text
Draft
Posted
Voided
```

### Draft

Editable and does not affect stock.

### Posted

Stock balances are updated.

Posted transactions should become immutable.

### Voided

A previously posted transaction is reversed through a controlled stock reversal.

The system must not simply delete the original stock movement.

---

# 13. Inventory Management

Inventory management shall provide:

- Current warehouse inventory
- Current representative inventory
- Stock import
- Warehouse transfers
- Representative stock issuing
- Stock receiving
- Stock adjustments
- Stock movement history

---

# 14. Stock Location Types

For transaction tracking, stock can logically exist at:

```text
Warehouse
Sales Representative
In Transit
```

This allows the application to identify stock during transfers.

---

# 15. Warehouse-to-Warehouse Transfer

Stock may be transferred between company warehouses.

Example:

```text
Yangon Warehouse
        ↓
   Product A × 300
        ↓
Mandalay Warehouse
```

---

# 16. Warehouse Transfer Workflow

Recommended flow:

```text
Draft
  ↓
Dispatched
  ↓
Received
```

Additional status:

```text
Cancelled
```

---

## 16.1 Draft

The source warehouse administrator prepares the transfer.

No stock is changed.

---

## 16.2 Dispatched

When dispatched:

```text
Source Warehouse Stock -= Quantity
In-Transit Stock += Quantity
```

---

## 16.3 Received

When destination warehouse confirms receipt:

```text
In-Transit Stock -= Quantity
Destination Warehouse Stock += Quantity
```

The transaction becomes completed.

---

## 16.4 Cancellation

A Draft transfer can be cancelled without affecting inventory.

A transfer that has already affected inventory must not simply be deleted.

It must use an authorized reversal or return transaction.

---

# 17. Sales Representative Management

Office administrators can manage sales representatives.

## 17.1 Representative Fields

Recommended information:

| Field | Description |
|---|---|
| Representative Code | Unique identifier |
| Name | Required |
| Phone | Contact |
| Email | Optional |
| Username | Login |
| Primary Warehouse | Main warehouse |
| Region | Assigned operating region |
| Vehicle | Optional |
| Status | Active/Inactive |
| Notes | Optional |

---

# 18. Sales Representative Stock

Every sales representative has an independent inventory.

Example:

### Representative: SR-001 — Ko Aung

| Product | Quantity |
|---|---:|
| Product A | 70 |
| Product B | 25 |
| Product C | 90 |

This inventory must not be manually edited by the representative.

Stock can change only through authorized transactions.

---

# 19. Representative Stock Limit

A representative may hold a maximum of:

> **100 units of each product**

This limit is applied separately to every product.

Example:

```text
Product A = 100
Product B = 100
Product C = 100
```

is allowed.

---

## 19.1 Limit Validation

If:

```text
Current Product A = 70
Incoming Product A = 40

70 + 40 = 110
```

the transaction must be rejected.

If:

```text
Current Product A = 70
Incoming Product A = 30

70 + 30 = 100
```

the transaction is valid.

---

## 19.2 Pending Stock Must Be Considered

The system should prevent multiple pending transfers from bypassing the limit.

The validation should consider:

```text
Current Representative Stock
+
Pending / In-Transit Incoming Stock
+
New Transfer
<=
100
```

Example:

```text
Current Stock        60
Already In Transit   30
New Request          20

Total                110
```

Result:

```text
Rejected
```

---

# 20. Warehouse-to-Representative Stock Transfer

The office distributes inventory from warehouses to representatives.

Workflow:

```text
Warehouse
     ↓
Stock Issue
     ↓
In Transit
     ↓
Representative Confirms Receipt
     ↓
Representative Inventory
```

---

# 21. Representative Stock Transfer Status

Recommended statuses:

```text
Draft
Dispatched
Received
Cancelled
```

---

## 21.1 Draft

Office prepares transfer.

No inventory change.

---

## 21.2 Dispatched

When dispatched:

```text
Warehouse Stock -= Quantity
In-Transit Stock += Quantity
```

The system must confirm sufficient warehouse stock before dispatch.

---

## 21.3 Received

The representative confirms receiving the products.

Then:

```text
In-Transit Stock -= Quantity
Representative Stock += Quantity
```

---

# 22. Representative Stock Receiving

Sales representatives shall have a **Stock Receiving** page.

Example:

```text
Pending Receiving

TRF-00128
Yangon Warehouse
10 August 2026

Product A × 30
Product B × 20

[ Confirm Received ]
```

After confirmation, the products become part of the representative's available inventory.

Representatives must not be able to modify transfer quantities.

---

# 23. Customer Management

The application shall contain a single Customer module.

Customer types may include:

```text
End User
Shop
Distributor
Other Business
```

Customer type is primarily informational.

---

# 24. Customer Fields

Recommended fields:

| Field | Description |
|---|---|
| Customer Code | Unique |
| Customer Name | Required |
| Customer Type | Shop/Distributor/etc. |
| Phone | Contact |
| Region | Location |
| Township | Location |
| Address | Optional |
| Credit Allowed | Yes/No |
| Credit Limit | Maximum outstanding credit |
| Notes | Optional |
| Status | Active/Inactive |

---

# 25. Customer Credit Control

Credit is completely controlled by the office.

Sales representatives cannot modify:

- Credit permission
- Credit limit

Example:

```text
ABC Shop

Credit Allowed: Yes
Credit Limit: 2,000,000 MMK
```

---

# 26. Credit Sale Validation

Before a representative can create a credit sale:

```text
Credit Allowed = Yes
```

must be true.

The application must then calculate:

```text
Current Outstanding Credit
+
New Credit Sale
<=
Credit Limit
```

Example:

```text
Credit Limit          2,000,000
Outstanding           1,400,000
New Sale                500,000

New Outstanding       1,900,000
```

Allowed.

But:

```text
Outstanding           1,700,000
New Sale                500,000

Total                 2,200,000
```

Result:

```text
Credit Sale Rejected
```

---

# 27. Customer Sales

The Sales Representative application shall contain a **New Sale** function.

This replaces the original terminology **Stock Purchase**.

The transaction represents products being sold from the sales representative's inventory to a customer.

---

# 28. Sales Workflow

```text
Sales Representative
        ↓
Select Customer
        ↓
Select Products
        ↓
Enter Quantities
        ↓
Choose Payment Type
        ↓
Validate Stock / Credit
        ↓
Post Sale
```

---

# 29. Sale Fields

A sale should contain:

### Header

- Sale number
- Date/time
- Representative
- Warehouse/branch reference
- Customer
- Payment type
- Total amount
- Status
- Notes

### Line Items

- Product
- Quantity
- Unit price
- Line total

---

# 30. Payment Types

Initial version should support:

```text
Cash
Credit
```

Complex payment structures are not required initially.

Mixed payment may be added later if required.

---

# 31. Cash Sale

Example:

```text
Product A
Quantity: 5
Price: 20,000

Sale Total = 100,000
```

When posted:

```text
Representative Product A Stock -= 5
Representative Cash Hold += 100,000
```

---

# 32. Credit Sale

When a credit sale is posted:

```text
Representative Product Stock -= Quantity
Customer Outstanding Credit += Sale Amount
```

Representative cash hold does not increase until money is actually collected.

---

# 33. Stock Validation During Sale

The application must never allow a representative to sell more products than available.

Example:

```text
Current Stock = 15
Requested Sale = 20
```

Result:

```text
Sale rejected
```

Stock validation must occur on the Laravel backend inside the database transaction.

Frontend validation alone is insufficient.

---

# 34. Sales Transaction Status

Recommended statuses:

```text
Draft
Posted
Voided
```

A Draft sale does not affect stock or money.

A Posted sale affects inventory and financial balances.

A Posted sale should not be directly edited.

Corrections should use controlled void/reversal functionality.

---

# 35. Sales Representative Cash Hold

The application must continuously track how much company cash each representative currently holds.

Example:

```text
Representative A

Cash Sale                  +100,000
Cash Sale                  +250,000
Previous Cash Hold         +150,000
Cash Submitted             -400,000
-----------------------------------
Current Cash Hold           100,000
```

---

# 36. Cash Hold Formula

Conceptually:

```text
Cash Hold
=
Cash Received by Representative
-
Confirmed Cash Submitted to Office
```

Cash from cash sales automatically increases cash hold.

---

# 37. Cash Submission

The sales representative may initiate a cash submission.

Example:

```text
Current Cash Hold: 800,000

Submit Amount: 600,000

[ Submit to Office ]
```

Recommended workflow:

```text
Pending
   ↓
Confirmed
```

---

## 37.1 Pending Cash Submission

Representative declares that money has been handed to the office.

Cash hold is not reduced until authorized office confirmation.

---

## 37.2 Confirmed Cash Submission

Admin confirms receipt.

Then:

```text
Representative Cash Hold -= Confirmed Amount
```

---

# 38. Cash Submission Validation

Representatives cannot submit more cash than their current cash hold.

Example:

```text
Cash Hold = 500,000
Submission = 600,000
```

Result:

```text
Rejected
```

---

# 39. Customer Credit Settlement

The system needs a mechanism to reduce customer outstanding credit when payment is received.

Authorized office users can create a **Customer Payment / Credit Settlement** transaction.

Required fields:

- Customer
- Amount
- Date
- Payment method
- Reference
- Notes
- Received by

When posted:

```text
Customer Outstanding Credit -= Payment
```

If future requirements allow representatives to collect credit payments, this module may also increase the appropriate representative's cash hold.

This can be implemented as an extension without changing the main stock architecture.

---

# 40. Vehicle Management

The admin application shall support Vehicle CRUD.

Recommended fields:

| Field | Description |
|---|---|
| Vehicle Number | Plate number |
| Vehicle Type | Car/Van/Motorcycle/etc. |
| Brand | Optional |
| Model | Optional |
| Assigned Representative | Optional |
| Status | Active/Inactive |
| Notes | Optional |

Vehicle functionality remains simple CRUD in version 1.

---

# 41. Role-Based Access Control

The system shall contain:

```text
Users
Roles
Permissions
Warehouse Assignments
```

---

# 42. Example Permissions

Possible permissions include:

```text
dashboard.view

warehouse.view
warehouse.create
warehouse.edit

product.view
product.create
product.edit

inventory.view
inventory.import
inventory.adjust

warehouse_transfer.view
warehouse_transfer.create
warehouse_transfer.dispatch
warehouse_transfer.receive

representative.view
representative.create
representative.edit

representative_stock.view
representative_stock.issue

customer.view
customer.create
customer.edit
customer.credit_manage

sale.view
sale.create
sale.void

cash.view
cash.confirm

vehicle.view
vehicle.create
vehicle.edit

report.view

user.manage
role.manage
```

---

# 43. Warehouse-Level Access

Permissions and warehouse access are separate.

Example:

```text
User has:
inventory.view

Warehouses:
Yangon
Mandalay
```

The administrator can therefore view inventory only for:

```text
Yangon
Mandalay
```

and not for other warehouses.

---

# 44. Inventory Transaction Principle

The application must follow the principle:

> Stock balances must never be changed directly by normal CRUD operations.

Stock balances must be modified through stock transactions.

Examples:

```text
Stock Import
Warehouse Transfer
Representative Transfer
Sale
Stock Adjustment
Transaction Reversal
```

---

# 45. Stock Movement Ledger

Every stock-changing transaction must generate a stock movement record.

Recommended information:

| Field | Purpose |
|---|---|
| Movement ID | Unique |
| Date/Time | Transaction time |
| Product | Product |
| Movement Type | Import/Transfer/Sale/etc. |
| Reference Type | Source transaction type |
| Reference ID | Transaction reference |
| From Location Type | Warehouse/Representative |
| From Location | Source |
| To Location Type | Warehouse/Representative |
| To Location | Destination |
| Quantity | Movement quantity |
| Created By | User |
| Notes | Optional |

---

# 46. Stock Movement Types

Recommended types:

```text
IMPORT_IN

WAREHOUSE_TRANSFER_OUT
WAREHOUSE_TRANSFER_IN

REP_TRANSFER_OUT
REP_TRANSFER_IN

SALE_OUT

ADJUSTMENT_IN
ADJUSTMENT_OUT

REVERSAL_IN
REVERSAL_OUT
```

---

# 47. Stock Balance Tables

For performance, the application should maintain current balance tables.

Conceptually:

## Warehouse Inventory

```text
warehouse_id
product_id
quantity
```

Unique combination:

```text
warehouse_id + product_id
```

---

## Representative Inventory

```text
representative_id
product_id
quantity
```

Unique combination:

```text
representative_id + product_id
```

The stock movement ledger provides history while the balance tables provide fast current-stock lookup.

---

# 48. Transaction Integrity

All operations affecting inventory or money must use Laravel/database transactions.

Example representative sale:

```text
BEGIN TRANSACTION

1. Lock representative stock record
2. Verify sufficient stock
3. Verify customer credit if applicable
4. Create sale
5. Create sale lines
6. Deduct representative inventory
7. Create stock movements
8. Update cash hold OR customer credit
9. Commit

COMMIT
```

If any step fails:

```text
ROLLBACK
```

No partial transaction must remain.

---

# 49. Concurrent Stock Protection

The application must protect inventory from simultaneous transactions.

Example:

```text
Warehouse stock = 50

Admin A tries to transfer 40
Admin B tries to transfer 30
```

The system must not allow final stock:

```text
-20
```

The backend must:

1. Lock the relevant balance record.
2. Check actual current quantity.
3. Perform the transaction.
4. Commit atomically.

Database row locking or equivalent transaction control shall be used.

---

# 50. Negative Inventory

Negative inventory must never be allowed.

The following must always remain true:

```text
Warehouse Inventory >= 0

Representative Inventory >= 0

In-Transit Inventory >= 0

Cash Hold >= 0

Customer Outstanding >= 0
```

---

# 51. Posted Transaction Editing

Posted financial and stock transactions should be immutable.

The user should not be allowed to simply change:

```text
50 units
```

to:

```text
40 units
```

after posting.

Instead:

```text
Original Transaction
       ↓
Void / Reverse
       ↓
Create Correct Transaction
```

This preserves transaction history.

---

# 52. Stock Adjustment

Authorized office users should have a Stock Adjustment function.

Use cases include:

- Damaged products
- Physical stock count differences
- Missing products
- Data corrections
- Found products

Types:

```text
Increase
Decrease
```

Required information:

- Warehouse
- Product
- Quantity
- Adjustment type
- Reason
- Notes
- Authorized user
- Date/time

Stock adjustments should be restricted to authorized roles.

---

# 53. Audit Log

Important administrative actions should be logged.

Recommended actions include:

- Login
- User created
- Role changed
- Customer credit changed
- Stock adjustment
- Stock import posting
- Transfer dispatch
- Transfer receiving
- Sale void
- Cash confirmation

Audit information should include:

```text
User
Action
Module
Record ID
Date/Time
Old Value where applicable
New Value where applicable
```

---

# 54. Representative Dashboard

The Sales Representative dashboard should display:

### Current Stock

Summary of stock currently held.

### Pending Stock

Stock waiting for receiving confirmation.

### Today's Sales

Example:

```text
Today's Sales: 1,250,000 MMK
```

### Cash Sales

```text
Cash: 850,000 MMK
```

### Credit Sales

```text
Credit: 400,000 MMK
```

### Current Cash Hold

```text
Cash Hold: 1,700,000 MMK
```

---

# 55. Representative My Stock

Example:

| Product | Available |
|---|---:|
| Product A | 70 |
| Product B | 25 |
| Product C | 100 |
| Product D | 12 |

Representatives have view-only access to current quantities.

---

# 56. Representative Sale Report

Representatives can view their own sales.

Filters:

- Today
- Date range
- Customer
- Product
- Payment type

Example:

| Invoice | Customer | Total | Payment | Date |
|---|---|---:|---|---|
| S-00125 | ABC Shop | 250,000 | Cash | 17 Aug |
| S-00126 | XYZ Shop | 500,000 | Credit | 17 Aug |

---

# 57. Admin Reports

The admin dashboard shall include the following reports.

## 57.1 Warehouse Stock Report

Filters:

- Warehouse
- Product
- Category

---

## 57.2 Representative Stock Report

Filters:

- Representative
- Warehouse
- Region
- Product

---

## 57.3 Stock Movement Report

Filters:

- Product
- Date range
- Movement type
- Warehouse
- Representative
- Transaction reference

---

## 57.4 Warehouse Transfer Report

Show:

- Source warehouse
- Destination warehouse
- Date
- Products
- Quantity
- Status
- Created by
- Received by

---

## 57.5 Representative Transfer Report

Show:

- Warehouse
- Representative
- Products
- Quantities
- Dispatch date
- Receive date
- Status

---

## 57.6 Sales Report

Filters:

- Date range
- Representative
- Warehouse
- Customer
- Product
- Cash/Credit

Summary:

```text
Gross Sales
Cash Sales
Credit Sales
Units Sold
```

---

## 57.7 Representative Cash Hold Report

Example:

| Representative | Current Cash |
|---|---:|
| SR-001 | 500,000 |
| SR-002 | 1,200,000 |
| SR-003 | 0 |

---

## 57.8 Customer Credit Report

Show:

- Customer
- Credit allowed
- Credit limit
- Current outstanding
- Available credit

Formula:

```text
Available Credit
=
Credit Limit
-
Outstanding Credit
```

---

# 58. Search and Filtering

Major management screens should support:

- Search
- Pagination
- Sorting
- Status filtering

Relevant pages should support filters such as:

```text
Warehouse
Representative
Product
Customer
Date Range
Status
```

---

# 59. Transaction Reference Numbers

Important transactions should have human-readable reference numbers.

Examples:

```text
IMP-000001
WTR-000001
RTR-000001
SAL-000001
ADJ-000001
CSH-000001
PAY-000001
```

Reference numbers must be unique.

---

# 60. Recommended Main Database Entities

The application will likely require the following main entities.

## Authentication / Permission

```text
users
roles
permissions
role_permissions
user_roles
user_warehouses
```

Depending on the chosen Laravel permission architecture, some tables may differ.

---

## Master Data

```text
warehouses
products
customers
sales_representatives
vehicles
```

---

## Inventory

```text
warehouse_inventories
representative_inventories

stock_imports
stock_import_items

warehouse_transfers
warehouse_transfer_items

representative_transfers
representative_transfer_items

stock_adjustments
stock_adjustment_items

stock_movements
```

---

## Sales

```text
sales
sale_items
```

---

## Customer Finance

```text
customer_payments
```

---

## Representative Cash

```text
representative_cash_transactions
cash_submissions
```

---

## System

```text
audit_logs
settings
```

---

# 61. Relationship Overview

Conceptually:

```text
Warehouse
   │
   ├── Warehouse Inventory
   │       └── Product
   │
   ├── Warehouse Transfers
   │
   └── Representative Transfers


Sales Representative
   │
   ├── Representative Inventory
   │       └── Product
   │
   ├── Sales
   │
   └── Cash Transactions


Customer
   │
   ├── Sales
   └── Credit Payments


Sale
   │
   └── Sale Items
           └── Product
```

---

# 62. API Architecture

Laravel should expose API endpoints consumed by React.

Suggested structure:

```text
/api/auth/*

/api/admin/*
/api/sales/*
```

Example:

```text
GET    /api/admin/products
POST   /api/admin/products

GET    /api/admin/warehouses

POST   /api/admin/stock-imports

POST   /api/admin/warehouse-transfers
POST   /api/admin/warehouse-transfers/{id}/dispatch
POST   /api/admin/warehouse-transfers/{id}/receive

POST   /api/admin/representative-transfers
POST   /api/admin/representative-transfers/{id}/dispatch

GET    /api/sales/stock
GET    /api/sales/receiving
POST   /api/sales/receiving/{id}/confirm

POST   /api/sales/sales

GET    /api/sales/cash-hold
```

Exact endpoint naming can be defined during implementation.

---

# 63. Backend Architecture

Recommended Laravel structure:

```text
Controllers
Services
Models
Policies
Requests
Resources
```

Critical business logic should not be placed only inside controllers.

For example:

```text
WarehouseTransferService
RepresentativeTransferService
SaleService
InventoryService
CashService
CreditService
```

These services should handle transaction-sensitive logic.

---

# 64. Authorization Architecture

Laravel Policies / Gates should be used to verify:

```text
Permission
+
Warehouse Scope
+
Record Ownership
```

Example:

```text
Can this admin view inventory?

Permission:
inventory.view = Yes

Warehouse access:
Yangon = Yes

Result:
Allow Yangon inventory
```

---

# 65. Frontend Architecture

React SPA may be organized approximately as:

```text
src/
├── admin/
├── sales/
├── components/
├── services/
├── hooks/
├── stores/
├── routes/
└── layouts/
```

The admin and sales representative sections should use separate layouts.

---

# 66. PWA Requirements

The application shall be installable as a Progressive Web App.

Required functionality:

- Web app manifest
- App icon
- Service worker
- Installable application
- Mobile responsive interface
- Full-screen/app-like experience
- Cached application shell

---

# 67. Offline Behaviour

Inventory-changing transactions should initially require an internet/server connection.

The first version should **not attempt offline stock synchronization** because offline inventory transactions can create conflicts.

Recommended PWA behaviour:

### Offline Allowed

- Open previously loaded application shell
- Show offline notification
- Possibly display cached read-only data

### Offline Not Allowed

- Post sale
- Confirm receiving
- Dispatch stock
- Transfer stock
- Change credit
- Adjust stock
- Submit/confirm cash

The system should display:

```text
Internet connection is required to complete this transaction.
```

This keeps stock integrity significantly simpler.

---

# 68. Responsive Requirements

Both applications must work correctly on:

- Desktop
- Laptop
- Tablet
- Android phone
- iPhone

The sales representative application should be designed mobile-first.

The admin dashboard should prioritize desktop/tablet layouts while remaining responsive.

---

# 69. Performance Requirements

The system should comfortably support:

- 50+ products
- Hundreds of representatives
- Multiple warehouses
- Thousands of customers
- Large transaction histories

Common pages should use:

- Pagination
- Indexed database queries
- Server-side filtering
- Proper relational indexes

The frontend should not load entire transaction tables into the browser unnecessarily.

---

# 70. Data Integrity Requirements

The database shall use appropriate:

- Foreign keys
- Unique constraints
- Indexes
- Transaction boundaries

Examples of uniqueness requirements:

```text
Product SKU must be unique

Warehouse Code must be unique

Representative Code must be unique

Customer Code must be unique

Transaction Reference must be unique
```

---

# 71. Duplicate Submission Protection

Important transactions should protect against accidental duplicate submissions caused by:

- Double clicking
- Mobile network retry
- Slow connection
- Browser refresh

The system should disable the submit button while processing and may additionally use unique transaction/request identifiers.

A single sale should never be created twice because the user clicked the button twice.

---

# 72. Validation Requirements

Validation must occur on both:

```text
React Frontend
+
Laravel Backend
```

Backend validation is authoritative.

Examples:

```text
Quantity > 0

Sale price >= 0

Credit limit >= 0

Cash submission > 0

Available stock >= requested quantity

Representative Product Holding <= 100
```

---

# 73. Transaction Rules Summary

## Stock Import

```text
Posted Import
→ Warehouse Stock increases
```

## Warehouse Transfer Dispatch

```text
Source Warehouse decreases
In Transit increases
```

## Warehouse Transfer Receive

```text
In Transit decreases
Destination Warehouse increases
```

## Representative Transfer Dispatch

```text
Warehouse decreases
In Transit increases
```

## Representative Transfer Receive

```text
In Transit decreases
Representative stock increases
```

## Cash Sale

```text
Representative stock decreases
Representative cash hold increases
```

## Credit Sale

```text
Representative stock decreases
Customer outstanding credit increases
```

## Customer Credit Payment

```text
Customer outstanding credit decreases
```

## Cash Submission Confirmation

```text
Representative cash hold decreases
```

## Positive Adjustment

```text
Warehouse stock increases
```

## Negative Adjustment

```text
Warehouse stock decreases
```

---

# 74. Business Rules

### BR-001

Every warehouse shall maintain separate product inventory.

### BR-002

Every representative shall maintain separate product inventory.

### BR-003

Warehouse inventory cannot become negative.

### BR-004

Representative inventory cannot become negative.

### BR-005

Representative inventory cannot exceed 100 units per product.

### BR-006

Pending/in-transit representative stock must count toward the 100-unit maximum.

### BR-007

Representatives cannot manually modify their inventory.

### BR-008

Only office-authorized users can modify customer credit permissions and limits.

### BR-009

A credit sale cannot exceed the customer's available credit.

### BR-010

Cash sales automatically increase representative cash hold.

### BR-011

Cash hold decreases only through confirmed cash settlement.

### BR-012

Posted stock transactions cannot be directly deleted.

### BR-013

Every stock change must produce stock movement history.

### BR-014

Every inventory-changing operation must execute within a database transaction.

### BR-015

Users can only access warehouses assigned to them unless they are Super Admin.

### BR-016

Sales representatives can only access their own representative account information.

---

# 75. Functional Requirements

## FR-001 Authentication

The system shall authenticate users using secure credentials.

## FR-002 Role Management

The system shall allow authorized users to create and manage roles.

## FR-003 Permission Management

The system shall support feature-level permissions.

## FR-004 Warehouse Assignment

The system shall allow users to be assigned to one or more warehouses.

## FR-005 Product Management

The system shall provide Product CRUD functionality.

## FR-006 Warehouse Management

The system shall provide Warehouse CRUD functionality.

## FR-007 Representative Management

The system shall provide Sales Representative CRUD functionality.

## FR-008 Customer Management

The system shall provide Customer CRUD functionality.

## FR-009 Vehicle Management

The system shall provide Vehicle CRUD functionality.

## FR-010 Stock Import

Authorized users shall be able to import stock into a warehouse.

## FR-011 Warehouse Stock

The system shall display current stock by warehouse.

## FR-012 Representative Stock

The system shall display current stock by representative.

## FR-013 Warehouse Transfer

The system shall transfer products between warehouses.

## FR-014 Representative Transfer

The system shall transfer products from a warehouse to a representative.

## FR-015 Representative Receiving

Representatives shall confirm receipt of stock.

## FR-016 Maximum Stock Validation

The system shall prevent a representative from holding more than 100 units of a product.

## FR-017 Customer Sale

Representatives shall be able to create customer sales.

## FR-018 Stock Validation

The system shall prevent sales exceeding representative stock.

## FR-019 Credit Control

The system shall enforce customer credit permission and credit limit.

## FR-020 Cash Hold

The system shall calculate the current cash held by each representative.

## FR-021 Cash Submission

Representatives shall be able to initiate cash submissions.

## FR-022 Cash Confirmation

Authorized admins shall confirm cash submissions.

## FR-023 Customer Payment

Authorized users shall be able to record customer credit payments.

## FR-024 Stock Adjustment

Authorized users shall be able to make controlled stock adjustments.

## FR-025 Stock Movement History

The system shall maintain complete product movement history.

## FR-026 Sales Report

The system shall provide sales reports.

## FR-027 Stock Report

The system shall provide warehouse and representative stock reports.

## FR-028 Cash Report

The system shall provide representative cash hold reports.

## FR-029 Credit Report

The system shall provide customer credit reports.

## FR-030 Audit Log

The system shall maintain logs for critical transactions and configuration changes.

---

# 76. Non-Functional Requirements

## NFR-001 Security

All sensitive endpoints must require authentication and authorization.

## NFR-002 Transaction Integrity

Stock and money-related operations must execute atomically.

## NFR-003 Availability

The application should be designed for normal daily commercial operation.

## NFR-004 Responsiveness

The UI must support desktop, tablet and mobile devices.

## NFR-005 PWA

The application must be installable as a PWA.

## NFR-006 Maintainability

Business logic should be separated from presentation code.

## NFR-007 Auditability

Important stock and financial activities must be traceable.

## NFR-008 Performance

Normal CRUD and reporting pages should respond efficiently under expected business volume.

## NFR-009 Data Protection

Passwords must never be stored in plain text.

## NFR-010 Database Backup

The production database should be backed up regularly.

---

# 77. Transaction Safety Example

Suppose Yangon Warehouse currently has:

```text
Product A = 50
```

Two administrators simultaneously request:

```text
Admin 1 → Transfer 40
Admin 2 → Transfer 30
```

The application must process the first successful transaction while locking the stock record.

After the first transfer:

```text
Stock = 10
```

The second transaction must re-check stock and return:

```text
Insufficient Stock
```

The system must never result in:

```text
Stock = -20
```

This requirement is one of the most important backend requirements in the project.

---

# 78. Example Complete Stock Flow

Initial Import:

```text
Yangon Warehouse
Product A = 5,000
```

Transfer to Mandalay:

```text
Yangon → Mandalay
Product A = 1,000
```

Result:

```text
Yangon = 4,000
Mandalay = 1,000
```

Issue to Representative:

```text
Mandalay → SR-001
Product A = 80
```

After receiving:

```text
Mandalay = 920
SR-001 = 80
```

Representative sells:

```text
SR-001 → ABC Shop
Product A = 20
```

Result:

```text
SR-001 = 60
```

Every step appears in stock movement history.

---

# 79. Example Cash Flow

Representative starts with:

```text
Cash Hold = 0
```

Cash sale:

```text
+300,000
```

Second cash sale:

```text
+200,000
```

Current:

```text
500,000
```

Representative submits:

```text
400,000
```

Admin confirms:

```text
Cash Hold = 100,000
```

---

# 80. Example Credit Flow

Customer:

```text
ABC Shop

Credit Allowed: Yes
Credit Limit: 2,000,000
Outstanding: 500,000
```

Representative creates:

```text
Credit Sale = 700,000
```

New outstanding:

```text
1,200,000
```

Available credit:

```text
800,000
```

Later office receives:

```text
Payment = 500,000
```

New outstanding:

```text
700,000
```

---

# 81. Recommended Admin Navigation

```text
Dashboard

Inventory
├── Warehouse Stock
├── Representative Stock
├── Stock Import
├── Warehouse Transfers
├── Representative Transfers
├── Stock Adjustments
└── Stock Movements

Sales
├── All Sales
├── Cash Sales
└── Credit Sales

Customers
├── Customer List
├── Credit Management
└── Customer Payments

Sales Representatives
├── Representative List
├── Representative Stock
└── Cash Hold

Master Data
├── Products
├── Warehouses
└── Vehicles

Reports
├── Stock Report
├── Stock Movement Report
├── Sales Report
├── Cash Hold Report
└── Customer Credit Report

Administration
├── Users
├── Roles
├── Permissions
└── Audit Logs
```

---

# 82. Recommended Representative Navigation

```text
Dashboard

My Stock

Stock Receiving

Sales
├── New Sale
└── Sale History

Customers

Cash
├── Cash Hold
└── Cash Submission

Profile
```

---

# 83. Out of Scope

The first version will specifically exclude:

- Foreign supplier management
- International purchase order management
- Procurement workflows
- Shipping/import documentation
- Customs management
- Full accounting
- General ledger
- Payroll
- HR management
- Manufacturing
- Production planning
- Enterprise accounting journals
- Complex approval workflows
- Advanced CRM
- Route optimization
- GPS representative tracking
- Offline transaction synchronization
- Complex tax engines
- Complex multi-currency accounting

These features can be added later without making the initial application unnecessarily complex.

---

# 84. Suggested Development Phases

## Phase 1 — Foundation

Develop:

- Laravel backend
- React SPA
- Authentication
- Admin/Sales routing
- Roles
- Permissions
- Warehouse assignments

---

## Phase 2 — Master Data

Develop:

- Warehouses
- Products
- Representatives
- Customers
- Vehicles

---

## Phase 3 — Core Inventory

Develop:

- Warehouse inventory
- Stock import
- Stock movement ledger
- Stock adjustment

---

## Phase 4 — Stock Transfer

Develop:

- Warehouse transfers
- Warehouse receiving
- Representative transfers
- Representative receiving
- 100-unit product limit

---

## Phase 5 — Sales

Develop:

- Representative stock
- Customer sales
- Cash sales
- Credit sales
- Stock deductions

---

## Phase 6 — Credit and Cash

Develop:

- Customer credit limits
- Customer outstanding balances
- Customer payments
- Representative cash hold
- Cash submission
- Admin confirmation

---

## Phase 7 — Reports

Develop:

- Warehouse stock report
- Representative stock report
- Stock movement report
- Sales report
- Cash report
- Customer credit report

---

## Phase 8 — PWA & Finalization

Develop:

- Manifest
- Service worker
- Installability
- Responsive/mobile optimization
- Offline screen
- Performance optimization
- Testing
- Deployment preparation

---

# 85. Critical Test Cases

Before production, the following tests are mandatory.

### Test 1 — Insufficient Warehouse Stock

Warehouse has:

```text
50
```

Attempt transfer:

```text
60
```

Expected:

```text
Rejected
```

---

### Test 2 — Representative Limit

Representative has:

```text
80
```

Attempt transfer:

```text
30
```

Expected:

```text
Rejected
```

---

### Test 3 — Representative Limit Exactly 100

Representative has:

```text
80
```

Transfer:

```text
20
```

Expected:

```text
Accepted
```

---

### Test 4 — Pending Stock Limit

Current:

```text
60
```

In transit:

```text
30
```

New transfer:

```text
20
```

Expected:

```text
Rejected
```

---

### Test 5 — Insufficient Representative Stock

Representative has:

```text
10
```

Attempts sale:

```text
15
```

Expected:

```text
Rejected
```

---

### Test 6 — Credit Disabled

Customer:

```text
Credit Allowed = No
```

Attempt credit sale.

Expected:

```text
Rejected
```

---

### Test 7 — Credit Limit Exceeded

Credit Limit:

```text
1,000,000
```

Outstanding:

```text
800,000
```

New Sale:

```text
300,000
```

Expected:

```text
Rejected
```

---

### Test 8 — Cash Sale

Cash sale:

```text
200,000
```

Expected:

```text
Cash Hold += 200,000
```

---

### Test 9 — Cash Submission

Cash Hold:

```text
500,000
```

Confirmed submission:

```text
400,000
```

Expected:

```text
Cash Hold = 100,000
```

---

### Test 10 — Concurrent Warehouse Transfer

Available:

```text
50
```

Two requests:

```text
40
30
```

Expected:

Only one valid transaction based on remaining inventory.

Inventory must never become negative.

---

# 86. Acceptance Criteria

The system will be considered functionally ready when:

- Administrators can manage warehouses.
- Administrators can manage products.
- Administrators can manage representatives.
- Administrators can manage customers.
- Administrators can manage vehicles.
- Roles and warehouse-level access work correctly.
- Stock can be imported into warehouses.
- Stock can be transferred between warehouses.
- Stock can be transferred to representatives.
- Representatives can confirm stock receiving.
- A representative cannot exceed 100 units of one product.
- Representatives can create customer sales.
- Sales automatically deduct representative stock.
- Cash sales increase cash hold.
- Credit sales update customer outstanding credit.
- Credit sales cannot exceed office-defined limits.
- Representatives can submit cash.
- Admins can confirm cash receiving.
- Current warehouse stock is accurate.
- Current representative stock is accurate.
- Current representative cash hold is accurate.
- Customer outstanding credit is accurate.
- Every stock transaction has stock movement history.
- Critical transactions use database transaction control.
- Concurrent transactions cannot create negative inventory.
- Admin and representative interfaces work as SPA/PWA applications.
- Permission restrictions are enforced by Laravel backend authorization.

---

# 87. Final System Principle

The core design philosophy of the application shall be:

> **Simple management, strict transactions.**

CRUD should remain simple for:

```text
Products
Warehouses
Representatives
Customers
Vehicles
Users
Roles
```

Strict transactional control shall be applied to:

```text
Stock Import
Warehouse Transfer
Representative Transfer
Stock Receiving
Stock Adjustment
Customer Sale
Customer Credit
Customer Payment
Representative Cash Hold
Cash Submission
Transaction Reversal
```

This architecture provides enough control for real company operations without turning the application into an unnecessarily complicated enterprise ERP system.