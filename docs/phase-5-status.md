# Phase 5 Status — Customer Sales

**Status:** Complete  
**Started:** 17 August 2026  
**Completed:** 17 August 2026

## Sale workflow

- [x] Representatives create and edit only their own `SAL-######` drafts using active customers in their primary operating warehouse and active products.
- [x] Draft lines copy the current whole-MMK product price; Laravel calculates and stores line/document totals, while React displays clearly labelled previews.
- [x] Cash and Credit are the only accepted payment types. Draft, Posted, and Voided are explicit enum-backed states.
- [x] Drafts are stock- and finance-neutral. Posting locks the sale, customer, products, representative inventory rows in product order, and the applicable financial balance before applying effects.
- [x] Draft creation and posting use independent idempotency keys, preventing duplicate documents or balance effects under double-click/retry behavior.
- [x] Posted lines and prices are immutable and there is no sale delete route.

## Stock, credit, cash, and reversal

- [x] Every posted line deducts representative stock and writes one append-only `SALE_OUT` movement; insufficient stock rejects the entire transaction with `INSUFFICIENT_REPRESENTATIVE_STOCK`.
- [x] Cash sales increase `representative_cash_balances` and append a `cash_sale` delta exactly once.
- [x] Credit sales require `credit_allowed` and enforce locked `outstanding + sale <= credit_limit`; accepted sales increase the balance and append a `credit_sale` delta exactly once.
- [x] Customer credit-setting changes lock the same customer row used by sale posting, serializing office changes with sales.
- [x] Authorized warehouse-scoped `sale.void` requires a reason, restores representative stock, appends `SALE_VOID_IN`, reverses cash or credit through a signed ledger delta, and preserves the original sale/movements.
- [x] Void rechecks the representative 100-unit cap and current financial balance so later settlement activity cannot produce an invalid reversal.

## APIs, authorization, and SPA

- [x] Representative APIs provide stock-aware sale options, own paginated history, create/update, and explicit post commands without accepting a representative ID from the client.
- [x] Admin APIs provide a warehouse-scoped sales register and separately permissioned void command.
- [x] `/sales/new-sale` provides mobile-first header entry, customer/payment selection, stock-aware product lines, cash/credit preview, server-total notice, draft save, and explicit posting.
- [x] `/sales/sales-history` provides immutable own history and draft edit/post actions. `/admin/sales` provides compact filters, KPIs, ledger rows, and controlled void actions.
- [x] Loading, empty, error, disabled, success, destructive-confirmation, light/dark, compact/comfortable, and responsive states use the shared UI shell.
- [x] English is the approved visible language through Phase 7; Myanmar localization remains scheduled for Phase 8 by the active architecture decision register.

## Demo and verification evidence

- [x] Repeatable seeding creates one posted 5,400 MMK cash sale, one posted 2,700 MMK credit sale, and one 10,500 MMK draft without duplication on repeated seeding.
- [x] Seed reconciliation proves zero line/header total mismatches; cash hold equals its ledger at 5,400 MMK; customer outstanding equals its ledger at 2,700 MMK; and representative quantities equal receipt/sale movement history at 24, 17, and 10 units.
- [x] PHPUnit: 82 tests, 698 assertions across all phases; Phase 5 contributes 10 transaction-focused feature tests.
- [x] Vitest/Testing Library: 27 tests, including representative sale-entry and admin-register rendering.
- [x] Sequential tests cover server pricing, preserved historical prices, stock insufficiency, credit disabled, credit exceeded/accepted, exact-once cash and credit, multi-line rollback, ownership, warehouse scope, immutable posting, cash/credit voids, and all ledger reconciliations.
- [x] MariaDB 10.4.32/InnoDB overlap verification posts only one of two 7-unit sales against 10 units and rejects the other with `INSUFFICIENT_REPRESENTATIVE_STOCK`.
- [x] The same check posts only one of two simultaneous 600 MMK credit sales against a 1,000 MMK limit and rejects the other with `CUSTOMER_CREDIT_LIMIT_EXCEEDED`; it passed three consecutive runs.
- [x] Pint, PHPUnit, TypeScript, ESLint, Vitest, Vite production build, migrations, `git diff --check`, and all Phase 3/4 concurrency regressions pass.
- [x] XAMPP nested-deployment visual checks cover representative entry/history and admin sales at desktop and true 390 px mobile in light/dark modes with no page overflow, severe console errors, or test mutations.

## Exit decision

All Phase 5 roadmap deliverables and exit criteria are satisfied. Sale, stock movement, representative cash, customer credit, audit, idempotency, and reversal records reconcile; invalid states cannot be silently edited or deleted; and both critical stock and credit contention rules are verified under genuinely overlapping database requests.

## Next roadmap phase

Begin Phase 6 — Customer Credit and Representative Cash.
