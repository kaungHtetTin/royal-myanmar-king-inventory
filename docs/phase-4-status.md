# Phase 4 Status — Stock Transfers and Representative Inventory

**Status:** Complete  
**Started:** 17 August 2026  
**Completed:** 17 August 2026

## Warehouse transfers

- [x] Multi-product drafts are stock-neutral, editable only while draft, uniquely numbered as `WTR-######`, and cancellable without deletion.
- [x] Dispatch locks the source balances, rejects insufficient stock, deducts warehouse stock, creates explicit in-transit custody and outbound movements, records the actor/audit event, and commits once under an idempotency key.
- [x] Full receipt locks and consumes custody, increases destination balances, creates paired inbound movements, and cannot apply twice.
- [x] Source scope controls creation and dispatch; destination scope independently controls receipt.
- [x] Dispatched reversal returns custody to the source. Received reversal transfers available stock from destination back to source using compensating history and a mandatory reason.

## Representative inventory and receiving

- [x] Multi-product issues are stock-neutral drafts numbered as `RTR-######`; dispatch validates source stock and reserves representative capacity atomically.
- [x] `representative_inventories` stores one current balance per representative/product and enforces a database-level maximum of 100.
- [x] Capacity uses `current + dispatched incoming + new <= 100`; current and incoming rows use locking reads on MariaDB to serialize competing issues.
- [x] The sales portal derives identity from the authenticated user's linked representative profile, lists only that representative's pending receipts, keeps lines immutable, and confirms full receipt once.
- [x] The representative stock page is read-only. Office queries are permission- and warehouse-scoped.
- [x] Draft cancellation and dispatched/received reversal preserve documents, movements, actors, reasons, and audit history.

## SPA and demo data

- [x] `/admin/transfers` provides compact warehouse-transfer, representative-issue, and representative-stock registers with server filters, pagination, metrics, permission-aware actions, and multi-line dialogs.
- [x] `/sales/my-stock` provides current holdings, incoming capacity metrics, immutable pending-receipt cards, and explicit full-receipt confirmation.
- [x] Both workspaces include loading, empty, error, success, light/dark, responsive, compact/comfortable, and flexible deployment-directory behavior.
- [x] English is the approved visible language through Phase 7; Myanmar localization remains scheduled for Phase 8 by the active architecture decision register.
- [x] Repeatable seeds create one received warehouse transfer, one received representative issue, and one pending representative issue without duplicating stock on re-seed.

## Verification evidence

- [x] PHPUnit: 72 tests, 584 assertions across all phases; Phase 4 contributes 11 transaction-focused feature tests.
- [x] Vitest/Testing Library: 25 tests, including admin transfer and representative receiving workflows.
- [x] Pint, TypeScript, ESLint, Vitest, PHPUnit, Vite production build, and `git diff --check` pass.
- [x] Sequential fixtures prove 80 + 30 is rejected, 80 + 20 is accepted, and 60 + pending 30 + new 20 is rejected.
- [x] Idempotency tests prove repeated dispatch/receipt commands do not duplicate balances, custody, movements, or audit effects.
- [x] Authorization tests cover source dispatch, destination receipt, office warehouse scope, and own-representative receipt.
- [x] MariaDB 10.4.32/InnoDB overlap verification posts only one competing warehouse deduction and rejects the other with `INSUFFICIENT_WAREHOUSE_STOCK`.
- [x] The same two-process check posts only one competing representative issue and rejects the other with `REPRESENTATIVE_STOCK_LIMIT_EXCEEDED`; projected stock finishes at 85.
- [x] Seeded product totals reconcile across warehouse, representative, and in-transit custody: `DW-1L` 240, `MW-500ML` 180, and `DW-12PK` 60.
- [x] XAMPP nested-deployment visual checks cover desktop light/dark, the representative-issue dialog, 390 px admin, and mobile/desktop sales receiving with no page-level overflow, severe console errors, or test mutations.

## Exit decision

All Phase 4 SRS deliverables and exit criteria are satisfied. Both state machines reject invalid transitions, posted documents cannot be silently edited or deleted, stock is traceable while in transit, custody totals reconcile, and the representative holding limit is verified under sequential and genuinely overlapping database requests.

## Next roadmap phase

Begin Phase 5 — Customer Sales.
