# Phase 2 Status — Master Data

**Status:** Complete  
**Started:** 17 August 2026
**Completed:** 17 August 2026

## Completed checkpoint — Warehouse management

- [x] Additive MySQL migration adds region, township, address, phone, and notes to the warehouse foundation.
- [x] Warehouse model and factory cover the complete SRS master-data shape and active/inactive state.
- [x] Scoped list API supports search, status, sorting, and pagination.
- [x] Create and update APIs normalize and enforce unique warehouse codes.
- [x] Super Admin can manage every warehouse; other administrators can only view/edit assigned warehouses when permitted.
- [x] Deactivation preserves warehouse assignments and no hard-delete endpoint is exposed.
- [x] Create and update actions write old/new audit metadata.
- [x] Local-only repeatable seed data provides Yangon, Mandalay, and Nay Pyi Taw demonstration warehouses.
- [x] Compact management UI includes metrics, filters, responsive table, loading/empty/error states, and create/edit dialogs.
- [x] Destructive deactivation requires confirmation and inactive records remain visible in history.
- [x] Backend feature tests cover validation, uniqueness, permissions, warehouse scope, deactivation, and auditing.
- [x] MySQL-backed XAMPP route and filter smoke checks pass below `/inventory/public`.
- [x] Compact light, comfortable dark, desktop, and 390 px mobile layouts are visually verified.

## Completed checkpoint — Product management

- [x] MySQL product schema stores unique SKU, name, optional category, unit, whole-kyat default selling price, optional unique barcode, description, and active status.
- [x] Product model and factory preserve MMK prices as integers and support active/inactive test states.
- [x] Global catalogue list API supports server-side SKU/name/barcode search, status/category/unit filters, sorting, and pagination.
- [x] Product option API supplies normalized category and unit values for SPA filters.
- [x] Create and update APIs normalize SKU and optional text, enforce SKU/barcode uniqueness, and reject negative or fractional prices.
- [x] Product view/create/edit permissions are enforced independently; no hard-delete endpoint is exposed.
- [x] Deactivation retains the product for future transaction history and requires UI confirmation.
- [x] Create and update actions write audit records with old/new metadata.
- [x] Local-only repeatable seed data provides realistic bottle and box catalogue items.
- [x] Compact SPA workspace includes metrics, six-way filters, responsive data table, formatted MMK values, and create/edit dialog.
- [x] Backend feature tests cover normalization, validation, uniqueness, permissions, filtering, options, deactivation, and auditing.
- [x] MySQL migration and seed, frontend tests, lint, type checking, formatting, backend suite, and production build pass.
- [x] Light, dark, dialog, desktop, and 390 px mobile states are visually verified below `/inventory/public`.

## Completed checkpoint — Vehicle management

- [x] MySQL vehicle schema stores a unique vehicle number, required type, optional brand/model, notes, active status, and optional representative assignment.
- [x] Database uniqueness and API validation enforce the one-vehicle-per-representative relationship from the conceptual model.
- [x] Vehicle model, factory, and representative inverse relationship support assignment-aware queries and tests.
- [x] Global vehicle list API supports number/make/model/representative search, status/type/assignment filters, sorting, and pagination.
- [x] Vehicle options API supplies existing vehicle types and active representative availability for assignment controls.
- [x] Create and update APIs normalize vehicle numbers, reject inactive or already-assigned representatives, and retain deactivated records.
- [x] Vehicle view/create/edit permissions are enforced independently; no hard-delete endpoint is exposed.
- [x] Create and update actions write audit records with old/new metadata.
- [x] Local-only repeatable seed data provides realistic van, truck, and motorcycle fleet records.
- [x] Compact SPA workspace includes fleet metrics, six-way filters, assignment-aware table, and responsive create/edit dialog.
- [x] Backend feature tests cover normalization, uniqueness, permissions, filters, assignment rules, options, deactivation, and auditing.
- [x] MySQL migration and seed, 41 backend tests, 20 frontend tests, lint, type checking, formatting, and production build pass.
- [x] Light, dark, desktop, mobile, and mobile-dialog states are visually verified below `/inventory/public` with zero page-level mobile overflow.

## Completed checkpoint — Customer management

- [x] MySQL customer schema covers unique code, required name, informational type, contact/location fields, operating warehouse, credit settings, notes, and active status.
- [x] Customer operating warehouse is the authoritative scope; Office Admin queries, options, creates, edits, and moves are restricted to assigned warehouses.
- [x] Whole-MMK credit limits are non-negative integers and outstanding credit remains outside editable master data.
- [x] Customer profile editing and `customer.credit_manage` are independently authorized through separate scoped endpoints.
- [x] Credit changes produce dedicated audit records containing old and new permission/limit values.
- [x] Server-side directory supports code/name/contact/location search, status/type/credit/warehouse filters, sorting, and pagination.
- [x] Customer option API supplies scoped active warehouses and existing customer types.
- [x] Deactivation retains customer records and no hard-delete endpoint is exposed.
- [x] Local-only repeatable seed data provides realistic cash-only and credit-enabled customers across Yangon and Mandalay.
- [x] Compact SPA workspace includes customer and credit metrics, seven-way filters, scoped table, and permission-aware profile/credit editor.
- [x] Backend feature tests cover normalization, uniqueness, warehouse scope, profile/credit permission separation, filters, options, validation, and audit metadata.
- [x] MySQL migration and seed, 47 backend tests, 21 frontend tests, lint, type checking, formatting, and production build pass.
- [x] Light, dark, desktop, mobile, and mobile-dialog states are visually verified below `/inventory/public` with zero page-level mobile overflow.

## Completed checkpoint — Sales representative management

- [x] Existing representative schema is integrated with a unique linked login account, primary warehouse, optional vehicle, region, contact details, notes, and active status.
- [x] Representative creation atomically creates the user, assigns the sales-representative role and primary warehouse, links an optional vehicle, and writes audit history.
- [x] Profile updates synchronize username, optional email, password changes, warehouse, vehicle, and active state with the linked account.
- [x] Deactivation preserves profile/account/warehouse/vehicle history while immediately blocking sales-portal authentication.
- [x] Office administrators are restricted to representatives in assigned warehouses; Super Admin retains global scope and representatives retain own-profile access only.
- [x] Directory API supports code/name/username/contact/region search, status/warehouse/vehicle filters, sorting, and pagination.
- [x] Options API supplies scoped active warehouses and assignment-aware active vehicles.
- [x] Unique representative code, username, and email constraints plus vehicle-conflict and inactive-warehouse validation are enforced server-side.
- [x] Repeatable local seed data provides Ko Aung and Ma Su accounts, including optional-email and assigned/unassigned vehicle scenarios.
- [x] Compact SPA workspace includes representative/account metrics, filters, linked profile/account editor, responsive table, and deactivation confirmation.
- [x] Admin light/dark desktop/mobile/dialog layouts and Ma Su's username-only sales login are verified below `/inventory/public`.

## Phase 2 completion verification

- [x] Warehouse, product, vehicle, customer, and representative CRUD/list workflows are visible and navigable in the SPA.
- [x] Search, sorting, pagination, filtering, loading, empty, error, active/inactive, and validation states are implemented on all master-data directories.
- [x] Database uniqueness covers warehouse code, SKU, vehicle number, customer code, representative code, usernames, emails, barcodes, and one-to-one assignments where applicable.
- [x] Assigned-warehouse access is enforced for warehouses, customers, and representatives, including destination-warehouse validation.
- [x] Customer credit changes require an independent permission and audit old/new permission and limit values.
- [x] Records are deactivated rather than deleted; no Phase 2 hard-delete routes are exposed.
- [x] Cross-master-data feature coverage creates, links, lists, and selects every Phase 2 entity through real APIs.
- [x] Repeatable MySQL seed data contains 3 warehouses, 3 products, 3 vehicles, 3 customers, and 2 linked representatives.
- [x] Final gates pass: 53 backend tests, 334 assertions, 22 frontend tests, Pint, TypeScript, ESLint, and Vite production build.
- [x] English is the approved Phase 2 UI locale; multilingual preparation remains scheduled for Phase 8.
- [x] All master records required by later stock transactions can be created and selected, and seed data supports realistic inventory/sales scenarios.

## Next roadmap phase

Begin Phase 3 — Core Warehouse Inventory: warehouse balances, append-only stock movements, stock imports, adjustments, and server-enforced transaction rules.
