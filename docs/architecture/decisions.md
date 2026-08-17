# Phase 0 Architecture Decisions

**Status:** Active baseline  
**Date:** 17 August 2026  
**Source:** Software Requirements Specification v1.0

This document records the decisions that constrain implementation. “Accepted” decisions may change only through a documented replacement decision. “Provisional” decisions require business or infrastructure confirmation before the phase named in the decision.

## Runtime baseline

| Component | Phase 0 baseline | Status |
|---|---:|---|
| PHP | 8.2.12 | Local constraint |
| Laravel | 12.66 | Accepted for local development |
| Node.js | 22.18 | Accepted |
| npm | 10.9 | Accepted |
| React | 19.2 | Accepted |
| TypeScript | 6.0 | Accepted |
| Vite | 7.3 | Accepted |
| Local database | SQLite for bootstrap/tests | Accepted |
| Transaction test/production database | InnoDB-capable MySQL/MariaDB | Accepted; MariaDB 10.4.32 verified locally |

Laravel 12 is the newest Laravel major compatible with the installed PHP 8.2. It receives security fixes until 24 February 2027. PHP 8.3+ and Laravel 13 should be evaluated before production rollout rather than performing a major framework upgrade during a transaction-heavy delivery phase.

## ADR-001: Single Laravel-hosted SPA repository

**Status:** Accepted

Laravel owns HTTP delivery, API routes, session security, and the production asset manifest. React is built by Vite and mounted from one Blade application shell. `/admin/*` and `/sales/*` remain separate frontend route trees, while `/api/admin/*` and `/api/sales/*` will remain separate API route groups.

This keeps deployment and cookie-based SPA authentication simple without mixing admin and representative authorization.

## ADR-002: TypeScript for the React application

**Status:** Accepted

All new frontend application code uses TypeScript/TSX. TypeScript is particularly valuable for transaction statuses, API payloads, permission names, money values, and stock quantities. Plain JavaScript is permitted only for compatible configuration or third-party bootstrap code.

## ADR-003: Sanctum cookie authentication

**Status:** Accepted for Phase 1

The same-origin SPA will use Laravel Sanctum stateful cookie authentication with CSRF protection. Tokens stored in browser local storage are not the default. Authentication does not replace authorization: every protected endpoint must also apply permissions, warehouse scope, or representative ownership.

## ADR-004: Roles and permissions

**Status:** Accepted for Phase 1

Use `spatie/laravel-permission` for role and feature-permission mechanics, with project-owned tables and policies for warehouse assignments and representative ownership.

Authorization evaluates:

```text
authenticated user
+ active account
+ feature permission
+ warehouse scope when applicable
+ representative ownership when applicable
```

Super Admin bypasses warehouse assignment checks but does not bypass authentication, active status, validation, or transaction-state rules.

## ADR-005: Current balances plus append-only ledgers

**Status:** Accepted

Warehouse and representative current balances are stored in dedicated tables with unique location/product keys. History is stored in append-only movement/financial records. Normal CRUD never edits a balance.

A balance mutation must occur in the same database transaction as its source document, ledger entry, actor/timestamp fields, and audit entry. Tests will regularly reconcile current balances to ledger totals.

## ADR-006: In-transit stock is document-backed and materialized

**Status:** Accepted for version 1

In-transit quantity is owned by a transfer document and materialized in `in_transit_inventories`, uniquely keyed by transfer type, transfer ID, and product. It is never exposed as manually editable stock. This materialized custody row gives dispatch, receipt, reversal, reconciliation, and contention checks one authoritative quantity to lock while the immutable transfer items explain its origin.

- Dispatch deducts the source balance and creates an outbound movement.
- Dispatch creates the corresponding in-transit custody row in the same transaction.
- Full receipt locks and consumes the custody row, creates the inbound movement, and increases the destination balance.
- Version 1 does not support partial receipt.
- Discrepancies require a controlled return, reversal, or adjustment according to an approved business rule.

The transfer document, custody row, stock movements, balance mutations, actors, and audit event commit atomically. Reconciliation tests guard against drift.

## ADR-007: Transaction state is explicit

**Status:** Accepted

Statuses are stored as stable lowercase string values backed by PHP enums and matching TypeScript unions. State changes happen through named service methods such as `dispatch`, `receive`, `post`, `void`, and `confirm`, not through generic update endpoints.

Posted/completed documents are immutable except for reversal metadata and non-financial administrative annotations explicitly approved later.

## ADR-008: Concurrency control

**Status:** Accepted

Stock, cash, credit, sequence, and idempotency records are locked inside database transactions before validation and mutation. Services re-read authoritative balances after acquiring locks. When several product rows are involved, locks are acquired in ascending product ID order to reduce deadlocks.

SQLite is sufficient for fast unit/feature tests but is not evidence that row-locking behavior works. Critical concurrency tests must also run against the selected MySQL-compatible database before Phase 3 exits.

## ADR-009: MMK storage

**Status:** Accepted for version 1

Version 1 displays and stores MMK as whole kyat using signed 64-bit integers, with non-negative validation on prices, limits, balances, and totals. The server calculates line totals and document totals.

Sale unit prices, line totals, document totals, credit limits, outstanding balances, and cash holds use this whole-MMK representation. If fractional amounts or another currency are required later, this decision and affected migrations must be replaced through a controlled upgrade.

## ADR-010: Reference numbers

**Status:** Accepted

Human-readable references use a type prefix and zero-padded sequence, for example `IMP-000001`. A database-backed sequence row is locked when allocating a reference. Gaps are acceptable; reuse is forbidden. The actual document column also has a unique constraint.

## ADR-011: Duplicate command protection

**Status:** Accepted

Critical command requests carry a client-generated idempotency key. The backend enforces uniqueness by authenticated actor, command type, and key, and returns the original result for a completed duplicate. Document state and database constraints remain a second line of defense.

The UI also disables submission while a request is processing, but backend idempotency is authoritative.

## ADR-012: API conventions

**Status:** Accepted

- API routes are under `/api` and split into `admin` and `sales` groups.
- JSON uses `snake_case`, matching Laravel conventions.
- List endpoints use server-side pagination, filtering, and sorting.
- Validation failures use HTTP 422.
- Authentication failures use HTTP 401; authorization/scope failures use HTTP 403.
- State conflicts, duplicate transitions, insufficient stock, and limit conflicts use HTTP 409 with stable domain error codes.
- Resource creation uses HTTP 201; successful commands use HTTP 200 unless no body is returned.

Example domain error:

```json
{
  "message": "Insufficient warehouse stock.",
  "code": "INSUFFICIENT_WAREHOUSE_STOCK",
  "errors": {
    "items.0.quantity": ["Only 50 units are currently available."]
  }
}
```

## ADR-013: Time, soft deletion, and audit actors

**Status:** Accepted

- Store timestamps in UTC and display them in the configured business timezone (`Asia/Yangon` initially).
- Master data with history is deactivated; soft deletion may be used where it adds operational value.
- Transaction documents are not soft-deleted as a substitute for voiding.
- Critical documents store creator and relevant action actors (`posted_by`, `dispatched_by`, `received_by`, `confirmed_by`, `voided_by`) with timestamps.

## ADR-014: Quality gates

**Status:** Accepted

Backend gates are Pint and PHPUnit. Frontend gates are TypeScript, ESLint, Vitest, and the Vite production build. The same commands run locally and in CI.

Larastan/PHPStan remains a Phase 0 follow-up because its package metadata could not be fetched reliably in the current network environment. It must not be represented as active until its command runs successfully.

## ADR-015: Customer operating warehouse and credit authority

**Status:** Accepted for Phase 2

Each customer belongs to one operating warehouse. Super Admin has global customer scope; other office users can only list, create, or edit customers within their assigned warehouses. Moving a customer to another warehouse requires access to both the current record and the destination warehouse.

Ordinary customer profile changes require `customer.edit`. Credit permission and whole-MMK credit limit changes require the independent `customer.credit_manage` permission and produce a dedicated audit event containing old and new values. Customer outstanding credit is not an editable master-data field; Phase 5 materializes it as a locked current balance explained by append-only sale/payment/reversal transactions.

## ADR-016: Representative profile and login account lifecycle

**Status:** Accepted for Phase 2

Each sales representative has exactly one linked user account. Representative creation and editing atomically synchronize profile name/email, unique username, sales-representative role, primary warehouse assignment, optional vehicle, and active state. Representative email is optional, so linked users may have a null email and authenticate by username.

Deactivation preserves the profile, user, warehouse assignment, vehicle relationship, and audit history while blocking sales-portal authentication immediately. Passwords are write-only and never included in API resources or audit metadata.

## ADR-017: MySQL-compatible production baseline

**Status:** Accepted for Phase 3

The deployed transaction baseline is an InnoDB-capable MySQL-compatible server. The current XAMPP environment runs MariaDB 10.4.32 with the balance and ledger tables on InnoDB. Phase 3's two-process integration verification demonstrates that `SELECT ... FOR UPDATE` serializes competing deductions and prevents negative warehouse inventory on this baseline.

SQLite in-memory remains the fast isolated PHPUnit connection, but it is not accepted as evidence for concurrency behavior. Each stock or financial phase with a new contention rule must retain a MySQL/MariaDB integration verification.

## ADR-018: Representative incoming-stock reservation

**Status:** Accepted for Phase 4

Representative stock is capped at 100 units per product across current holdings and all dispatched incoming custody. Dispatch is the reservation point. The command locks the representative/product balance mutex, then performs a locking current read of matching in-transit rows before accepting a new issue.

The locking read is required on the MariaDB repeatable-read baseline: a plain aggregate can retain an earlier snapshot after a competing dispatch commits. Draft issues do not reserve capacity. Cancellation or reversal of a dispatched issue releases custody; receipt converts custody to current stock without changing the projected total. The database also checks that an individual representative balance remains between 0 and 100 as defense in depth.

## ADR-019: Sale pricing and financial balances

**Status:** Accepted for Phase 5

Representatives cannot override selling price in version 1. Draft creation and update copy the current product selling price into each sale line, calculate line/document totals on the server, and preserve those values historically. Client totals are previews only; posting rechecks stored arithmetic but does not silently replace the agreed draft price with a later product price.

Customer outstanding credit and representative cash hold are materialized current balances with unique owner keys. `customer_credit_transactions` and `representative_cash_transactions` are append-only signed-delta ledgers. A sale post locks the customer, deterministic representative inventory rows, and the applicable financial balance before committing the document, stock movements, financial entry, balance, actor, and audit event atomically.

Cash posting increases representative cash hold; credit posting increases customer outstanding credit only when enabled and within the locked limit. Authorized `sale.void` requires a reason and writes compensating stock and financial entries. It can be rejected when later stock-cap, cash-settlement, or credit-settlement state makes a safe reversal impossible. Sale creation and posting have separate idempotency commands.

## ADR-020: Settlement reservation, overpayment, and reversal policy

**Status:** Accepted for Phase 6

A pending representative cash submission records a declared office handover but has no ledger or cash-hold effect. To prevent contradictory declarations, submission creation locks the representative cash balance and rejects `pending total + requested > current hold`. Office confirmation re-locks and rechecks the hold, then atomically appends a negative cash delta. Cancellation is pending-only and neutral. Authorized reversal is confirmed-only, reason required, restores the hold, and links its compensating entry through `reversal_of_id`.

Customer payments begin as finance-neutral drafts containing amount, date, method, external reference, notes, and the receiving actor. Posting locks the customer and credit balance and rejects payment above outstanding credit; version 1 does not create unapplied cash or negative customer balances. Authorized `customer_payment.void` requires a reason, restores outstanding credit, and appends a positive transaction linked to the original payment entry. Posted documents and ledger entries have no generic edit or delete path.

## ADR-021: Reporting scope, status, and date policy

**Status:** Accepted for Phase 7

Every admin dashboard, report, and audit query constrains accessible warehouses before aggregation, filtering, sorting, or pagination. Super Admin may use the global scope; Office Admin receives only assigned warehouses. Representative dashboard and report scope is derived from the authenticated representative account.

Dashboard sales KPIs include only Posted sales and use `posted_at`. Report document registers include Draft, Posted, and Voided rows unless a status filter is supplied, but cash, credit, gross, and units-sold summaries include Posted records only. A document row is dated by `posted_at` when present and otherwise by `created_at`. Money is stored and aggregated as whole MMK; timestamps remain UTC in storage and are formatted in the configured Asia/Yangon business timezone.

Large report collections remain server-paginated. Version 1 adds no browser-built export; a future large export must stream or execute as a server-side job. Composite sale, transfer, and audit indexes are migration-owned and verified against representative and warehouse aggregation plans on MariaDB.

## ADR-022: PWA offline integrity boundary

**Status:** Accepted for Phase 8

The service worker caches the application shell, production asset manifest, hashed JS/CSS chunks, icons, and previously visited same-origin navigation responses. It never intercepts API/Sanctum requests, non-GET requests, or creates a background mutation queue. A last-known, non-secret user profile may be stored locally only to render the read-only shell when session restoration cannot reach the server.

The browser announces offline status globally. Inventory and money transaction controls are disabled with the message `Internet connection is required to complete this transaction.` An Axios request interceptor independently rejects every non-read request before its transport adapter while `navigator.onLine` is false. Server authentication, authorization, state, balances, and ledgers remain authoritative after reconnection.

## ADR-023: Phase 8 production hardening and operations baseline

**Status:** Accepted

Production uses explicit credentialed CORS origins, database sessions with HTTP-only/SameSite cookies, secure cookies over HTTPS, API user/IP rate limiting, security headers, daily structured JSON logs, request IDs, liveness/readiness probes, and daily encrypted off-host MySQL/MariaDB backups. A backup is usable only after automated restore verification succeeds.

Common list/report queries remain server-paginated and query bounded. Migration-owned composite indexes are verified on MariaDB using realistic filters and a 250 ms p95 local integration budget. Vite route chunks are hashed and served with immutable caching, while the service worker and web manifest are never long-cached.

## ADR-024: Version 1 locale and language

**Status:** Accepted for version 1

Version 1 uses English interface labels, whole-unit MMK formatting, UTC storage, and `Asia/Yangon` business display time. The font stack includes `Noto Sans Myanmar` as a script-compatible fallback, but a Myanmar translation is not required by the current SRS. Adding translated labels later requires business-approved terminology and an explicit localization work package; it does not block Phase 8.

## ADR-025: Evidence-backed production release gate

**Status:** Accepted for Phase 9

Production rollout uses two explicit gates. `inventory:readiness --production --stage=preflight` requires hardened configuration, a recent backup, named owners, an active pilot representative assigned to the active pilot warehouse, zero reconciliation mismatches, and private UAT/opening-balance/restore/pilot evidence before traffic is enabled. After live checks and approval are recorded, `--stage=final` additionally requires post-launch evidence. Repository templates are not sign-off: real approvals live outside source control and are referenced by the configured private JSON evidence file.

Initial-data CSVs are validation contracts, not an unaudited bulk writer. Operators create master data through authorized administration screens and post opening stock through the transactional Stock Import workflow so validation, permissions, audit events, and ledgers remain authoritative.

## Decisions still requiring confirmation

| Decision | Needed before | Default if approved |
|---|---|---|
| PHP 8.3+/Laravel 13 upgrade | Phase 1 completion | Upgrade before transaction modules if environment is ready |
| Hosting, final backup retention, RPO/RTO | Phase 9 | Current safe defaults require production-owner approval before rollout |
