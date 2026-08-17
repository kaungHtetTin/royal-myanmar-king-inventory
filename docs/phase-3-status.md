# Phase 3 Status — Core Warehouse Inventory

**Status:** Complete  
**Started:** 17 August 2026  
**Completed:** 17 August 2026

## Inventory foundation

- [x] `warehouse_inventories` stores one current balance per warehouse/product under a database unique constraint.
- [x] `stock_movements` is an append-only ledger with typed direction, source document, reference, location, product, quantity, actor, note, and occurrence time.
- [x] `document_sequences` issues unique human-readable `IMP-######` and `ADJ-######` references under a row lock.
- [x] `idempotency_keys` protects named post/void commands from duplicate client submission.
- [x] Inventory and movement endpoints enforce `inventory.view` and assigned-warehouse scope while supporting warehouse/product/type/reference/date filters and pagination.
- [x] Movement resources expose their source and actor, making each balance change explainable.

## Stock imports

- [x] Create and edit support multi-product draft imports and reject inactive or duplicate products.
- [x] Drafts are stock-neutral and remain editable only in the draft state.
- [x] Posting locks the document and all affected warehouse balances in stable product order, increases stock, writes one `IMPORT_IN` movement per product, records an audit event, and marks the document posted in one transaction.
- [x] Repeating a completed command with the same idempotency key returns its original result without duplicating stock or movement history.
- [x] Posted imports are immutable and have no delete route.
- [x] Void requires a reason, preserves the original import and movements, locks/rechecks current stock, writes compensating `REVERSAL_OUT` movements, audits the actor, and marks the import voided.

## Stock adjustments

- [x] Increase and decrease drafts require warehouse, product, positive whole-unit quantity, and mandatory reason.
- [x] `inventory.adjust` is independent from `inventory.view` and warehouse scope is enforced for every mutation.
- [x] Posting rechecks the draft state and active master data inside the transaction.
- [x] Balance rows are locked with `SELECT ... FOR UPDATE`; decreases return stable `INSUFFICIENT_WAREHOUSE_STOCK` conflicts before any negative balance can be written.
- [x] Each posted adjustment writes exactly one `ADJUSTMENT_IN` or `ADJUSTMENT_OUT` movement and an audit record atomically.
- [x] Posted adjustments are immutable and have no delete route.

## SPA and seed data

- [x] The compact inventory workspace includes on-hand, imports, adjustments, and movement-history tabs.
- [x] Registers include loading, empty, error, filtered, paginated, and permission-aware action states.
- [x] Import drafts use a wide multi-line product dialog; adjustment drafts use a compact reason-first dialog.
- [x] The workspace retains the shared light/dark themes, compact/comfortable density modes, native controls, responsive tables, and flexible nested deployment paths.
- [x] Repeatable local seeding posts a 480-unit Yangon opening import through the production transaction service, producing three matching balances and ledger entries without duplication on re-seed.
- [x] Desktop light/dark, import dialog, 390px mobile, and mobile adjustment dialog states pass visual checks with no page-level horizontal overflow or severe console errors.

## Verification evidence

- [x] PHPUnit: 61 tests, 435 assertions.
- [x] Vitest/Testing Library: 23 tests.
- [x] Pint, ESLint, TypeScript, Vite production build, and all existing phase regression tests pass.
- [x] Draft import tests prove no current-balance or movement mutation.
- [x] Same-key retry tests prove import/adjustment posting and import void do not apply twice.
- [x] Failed decrease tests prove document, balance, movement, and audit changes roll back atomically.
- [x] Reversal tests retain both `IMPORT_IN` and `REVERSAL_OUT` history and restore the prior balance.
- [x] Reconciliation fixtures prove the current warehouse balance equals net applicable movement quantity.
- [x] The two-process MariaDB check holds an InnoDB balance row lock, overlaps two 40-unit deductions against 50 units, posts one, rejects one with `INSUFFICIENT_WAREHOUSE_STOCK`, and finishes at 10 units with one movement.

## Exit decision

All Phase 3 SRS deliverables and exit criteria are satisfied. Warehouse stock can be reconstructed and explained from movement history, and imports, adjustments, reversals, idempotency, atomicity, and real-database concurrency protections are verified.

## Next roadmap phase

Begin Phase 4 — Stock Transfers and Representative Inventory.
