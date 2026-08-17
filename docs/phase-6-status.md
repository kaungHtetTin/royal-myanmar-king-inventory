# Phase 6 Status — Customer Credit and Representative Cash

**Status:** Complete  
**Started:** 17 August 2026  
**Completed:** 17 August 2026

## Representative cash control

- [x] The representative workspace reads only the authenticated active representative’s materialized cash hold and append-only signed transaction history.
- [x] Representatives create positive `CSB-######` pending submissions without supplying a representative or warehouse ID. Locked creation rejects pending-total oversubscription.
- [x] Pending submissions reserve the available-to-submit amount but do not change cash hold or create a ledger entry. Pending cancellation requires a reason and remains financially neutral.
- [x] Warehouse-scoped `cash.confirm` atomically locks and reduces the hold, records the confirmer/time/reference, appends `cash_submission_confirmed`, and returns the saved idempotent result on retry.
- [x] Independent `cash.reverse` authorization requires a reason, restores cash hold, changes Confirmed to Reversed, and appends `cash_submission_reversed` linked to the confirmation transaction.

## Customer credit settlement

- [x] Office users can view outstanding credit only for customers in assigned warehouses, including inactive customers that still owe a balance.
- [x] `PAY-######` drafts preserve customer, whole-MMK amount, payment date, method, optional external reference, notes, receiver, and creator while remaining finance-neutral.
- [x] Posting locks the document, customer, and current credit balance; it atomically reduces outstanding credit and appends a negative `customer_payment` transaction.
- [x] Version 1 rejects overpayment with `INSUFFICIENT_CUSTOMER_CREDIT`; a failed post leaves the draft, balance, and ledger unchanged.
- [x] Independent `customer_payment.void` authorization requires a reason, restores outstanding credit, marks the payment Voided, and appends a positive linked reversal.
- [x] Posted/voided payments, confirmed/reversed submissions, and all financial ledger entries have no generic update or delete workflow.

## APIs, authorization, and SPA

- [x] Representative endpoints expose own overview/history, submission creation, and own pending cancellation under `cash.view`/`cash.submit`.
- [x] Admin endpoints separate cash viewing, confirmation, reversal, payment viewing, payment creation/posting, and payment void permissions; every query/action applies warehouse scope first.
- [x] `/sales/cash-hold` and `/sales/cash-submissions` share a mobile-first cash workspace with custody cards, pending availability, submission dialog, status history, and signed ledger activity.
- [x] `/admin/cash` provides compact KPI cards and permission-aware tabs for representative balances, cash submissions, customer outstanding credit, and the payment register.
- [x] Loading, empty, error, success, disabled, confirmation, light/dark, desktop/mobile, and nested-deployment states use the shared native-feeling UI shell.

## Demo and verification evidence

- [x] Repeatable seeding confirms a 4,000 MMK handover, leaves a 1,000 MMK submission pending, posts a 2,000 MMK customer payment, and preserves a 300 MMK draft without duplication on repeated runs.
- [x] Seed reconciliation proves representative cash hold 1,400 MMK equals its signed ledger; pending 1,000 MMK has no ledger effect; customer outstanding 700 MMK equals its signed ledger; and every existing reversal has an original link.
- [x] PHPUnit: 88 tests and 768 assertions across all phases; Phase 6 contributes 6 settlement-focused feature tests.
- [x] Vitest/Testing Library: 29 tests, including rendered representative cash and office finance workspaces plus dialog entry.
- [x] Sequential tests cover pending neutrality/reservation, the 500,000/400,000/100,000 example, exact-once confirmation, ownership, warehouse scope, permission separation, cancellation, linked cash reversal, payment draft/post, overpayment rollback, immutability, and linked payment void.
- [x] MariaDB 10.4.32/InnoDB overlap verification holds the shared balance lock and proves one of two 700 MMK confirmations against 1,000 succeeds while the other waits then fails, leaving 300.
- [x] The same genuine overlap proves one of two 700 MMK customer payments against 1,000 outstanding succeeds while the other waits then fails, leaving 300.
- [x] Pint, PHPUnit, TypeScript, ESLint, Vitest, Vite production build, migrations, repeat seeding, reconciliation, and Phase 3/4/5/6 database concurrency regressions pass.
- [x] XAMPP nested-deployment visual checks cover admin desktop and representative 412 px mobile layouts in light/dark modes, including payment/cash dialogs, without financial mutations.

## Exit decision

All Phase 6 roadmap deliverables and exit criteria are satisfied. Cash hold and customer outstanding balances reconcile to their append-only histories; pending/draft states are neutral; posting, confirmation, and reversals are scoped, idempotent, auditable, and concurrency safe; and the compact SPA exposes only authorized actions.

## Next roadmap phase

Begin Phase 7 — Dashboards, Reports, and Auditability.
