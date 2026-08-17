# Stock & Inventory Management System

## Development Roadmap

**Version:** 1.0  
**Prepared:** 17 August 2026  
**Source:** `docs/software-requrements.md` (SRS v1.0)  
**Target stack:** Laravel API + React + Vite SPA/PWA

---

## 1. Purpose

This roadmap converts the Software Requirements Specification into an ordered implementation plan. It defines what each phase must deliver, the dependencies between phases, the critical business rules to protect, and the verification required before work can move forward.

The governing design principle is:

> **Simple management, strict transactions.**

Master-data screens should remain straightforward. Stock, credit, sales, cash, and reversals must be implemented as auditable, atomic transactions.

---

## 2. Delivery Rules

These rules apply to every phase.

1. The Laravel backend is authoritative for authentication, authorization, validation, balances, and transaction state.
2. React validation improves usability but never replaces backend validation.
3. Stock and financial balances are never changed by ordinary CRUD updates.
4. Every stock or money operation runs inside a database transaction.
5. Relevant balance rows are locked and rechecked before mutation.
6. Warehouse scope and record ownership are enforced server-side.
7. Posted transactions are immutable. Corrections use controlled void or reversal transactions.
8. Every stock change creates a stock-movement record.
9. Important configuration and transaction actions create audit-log records.
10. Important POST actions are protected against duplicate submission.
11. Automated tests are part of the phase deliverable, not deferred cleanup.
12. A phase is complete only when its exit criteria pass.

---

## 3. Target Architecture

### 3.1 Application boundaries

```text
React/Vite SPA
├── Admin application (/admin/*)
└── Representative application (/sales/*)
          │
          ▼
Laravel JSON API (/api/*)
├── Authentication and authorization
├── Application services
├── Policies and warehouse scoping
├── Database transactions and row locks
└── API resources and validation requests
          │
          ▼
Relational database
├── Master data
├── Current balance tables
├── Transaction documents
├── Stock/cash ledgers
└── Audit records
```

### 3.2 Backend layers

- Controllers: translate HTTP requests and responses.
- Form Requests: validate input and authorize basic access.
- Policies/Gates: enforce permissions, warehouse scope, and ownership.
- Application Services: own transaction-sensitive business workflows.
- Models: relationships, casts, and query scopes.
- API Resources: stable response formats.
- Jobs: only for non-critical asynchronous work such as exports or notifications.
- Events/listeners: useful for secondary effects, but never the sole mechanism for required stock or balance mutations.

Suggested transaction services:

- `StockImportService`
- `InventoryService`
- `WarehouseTransferService`
- `RepresentativeTransferService`
- `SaleService`
- `CreditService`
- `CashService`
- `ReversalService`
- `ReferenceNumberService`
- `AuditService`

### 3.3 Frontend structure

```text
src/
├── admin/
├── sales/
├── components/
├── features/
├── layouts/
├── routes/
├── services/
├── stores/
├── hooks/
└── types/
```

Admin and representative applications use separate layouts and route guards. Permission-based rendering is a usability feature; API authorization remains mandatory.

---

## 4. Phase Overview

| Phase | Outcome | Depends on |
|---|---|---|
| 0 | Architecture and delivery foundation agreed | SRS |
| 1 | Secure application foundation and access control | Phase 0 |
| 2 | Master data ready for transactions | Phase 1 |
| 3 | Warehouse inventory and immutable stock ledger | Phase 2 |
| 4 | Warehouse and representative transfer workflows | Phase 3 |
| 5 | Representative sales with stock and credit validation | Phase 4 |
| 6 | Customer credit settlement and representative cash control | Phase 5 |
| 7 | Operational dashboards, reports, and audit tools | Phases 3–6 |
| 8 | PWA, responsive UX, performance, and system hardening | Phases 1–7 |
| 9 | Production readiness and controlled rollout | Phase 8 |

Work inside a phase may be split into small vertical slices, but a dependent phase must not rely on incomplete transaction rules.

---

## 5. Phase 0 — Architecture and Project Setup

### Objective

Remove high-risk ambiguity, establish project conventions, and create a repeatable development environment.

### Deliverables

- Initialize the Laravel backend and React/Vite frontend.
- Decide whether the codebase is a Laravel-hosted SPA or separate frontend/backend projects.
- Record supported PHP, Laravel, Node.js, database, and browser versions.
- Configure local environment templates without committing secrets.
- Configure database migrations, seeders, factories, and test database isolation.
- Configure code formatting, static analysis, linting, and automated tests.
- Establish API versioning and error-response conventions.
- Establish naming conventions for statuses, permissions, references, and money fields.
- Define the state machines for imports, transfers, sales, submissions, and reversals.
- Produce an initial entity-relationship diagram.
- Define an authorization matrix for Super Admin, Office Admin, and Sales Representative.
- Decide how in-transit quantities are represented and queried.
- Decide currency storage and rounding rules for MMK.
- Decide reference-number generation and idempotency-key behavior.

### Required architecture decisions

1. **Authentication:** Laravel Sanctum using secure cookie/session authentication for the SPA.
2. **Permissions:** role/permission implementation plus a separate user-to-warehouse assignment relationship.
3. **Balances:** dedicated warehouse and representative balance rows with unique composite constraints.
4. **Stock history:** append-only stock movement records tied to their source transaction.
5. **Money history:** append-only representative cash transactions and customer payment/sale records.
6. **Concurrency:** database transactions and `lockForUpdate()` or database-equivalent row locking.
7. **Idempotency:** client request key or other uniqueness guarantee on critical commands.
8. **Deletion policy:** deactivate master records with history; do not hard-delete posted transactions.

### Exit criteria

- A developer can install, configure, migrate, seed, build, and test the application from documented commands.
- CI or the agreed local quality command runs backend and frontend checks.
- Transaction state diagrams and authorization matrix are reviewed against the SRS.
- No unresolved architecture decision blocks Phase 1.

---

## 6. Phase 1 — Foundation, Authentication, and Authorization

### SRS coverage

FR-001 through FR-004; NFR-001, NFR-006, and NFR-009.

### Backend deliverables

- User authentication, logout, current-user endpoint, and inactive-user rejection.
- User, role, permission, role assignment, and warehouse assignment models.
- Super Admin bypass for warehouse scope without bypassing authentication.
- Policies/Gates combining permission, warehouse access, and record ownership.
- Separate `/api/admin/*` and `/api/sales/*` route groups.
- Standard validation-error, authorization-error, and domain-error responses.
- Authentication and important access changes written to the audit log.
- Seeded Super Admin account and baseline permissions.

### Frontend deliverables

- Separate admin and representative login routes and layouts.
- Protected routing and session restoration.
- Unauthorized, forbidden, inactive-account, and session-expired states.
- Admin user, role, permission, and warehouse-assignment management.
- Responsive navigation shells for both application sections.

### Current implementation checkpoint

- Authentication, portal boundaries, permission checks, warehouse scope, representative ownership, and inactive-account enforcement are complete.
- Scoped user/access administration and protected role/permission APIs are complete and audited.
- The compact user, role, permission, and warehouse-assignment management UI is complete.
- Phase 1 end-to-end verification is complete against the MySQL-backed XAMPP deployment; all Phase 1 exit criteria are satisfied.

### Verification

- Inactive users cannot log in.
- An Office Admin without a permission receives HTTP 403 even if the UI route is manually opened.
- An Office Admin cannot query an unassigned warehouse by changing request parameters.
- A representative cannot read another representative's records.
- Super Admin can access every warehouse.
- Historical records remain linked when a user is deactivated.

### Exit criteria

- Access tests cover permission, warehouse scope, ownership, inactive status, and Super Admin behavior.
- All protected endpoints reject unauthenticated requests.
- Admin and representative route boundaries are working end to end.

---

## 7. Phase 2 — Master Data

### SRS coverage

FR-005 through FR-009.

### Deliverables

- Warehouse management.
- Product management.
- Sales representative management and linked login account.
- Customer management and office-controlled credit settings.
- Vehicle management and optional representative assignment.
- Search, sorting, pagination, filtering, and active/inactive status.
- Unique constraints for warehouse code, SKU, representative code, customer code, and relevant usernames/emails.
- Backend enforcement of warehouse access on relevant records.
- Audit logs for critical changes, especially customer credit permission and limit.

### Current implementation checkpoint

- Warehouse management is complete across schema, scoped APIs, auditing, local seed data, automated tests, and responsive SPA UI.
- Product management is complete across the MySQL schema, permission-protected APIs, server-side catalogue filters, auditing, local seed data, automated tests, and compact responsive SPA UI.
- Vehicle management is complete across the MySQL schema, one-to-one representative assignment rules, permission-protected APIs, filters, auditing, seed data, tests, and compact responsive SPA UI.
- Customer management is complete across the MySQL schema, assigned-warehouse scope, independently permissioned credit controls, dedicated credit auditing, seed data, tests, and compact responsive SPA UI.
- Sales representative management is complete across linked login lifecycle, assigned-warehouse scope, optional vehicle assignment, synchronized deactivation, audit history, seed data, tests, and compact responsive SPA UI.
- Phase 2 cross-master-data creation/selection, MySQL seed data, automated quality gates, nested-deployment routes, and responsive visual checks are complete. Phase 3 is next.

### Data rules

- Records with transaction history are deactivated rather than deleted.
- Product selling price is a default; sale items preserve the actual historical unit price.
- Credit limits cannot be negative.
- Representatives cannot alter customer credit fields.
- Inactive products, warehouses, customers, and representatives cannot be used in new transactions unless an explicitly documented rule permits it.

### Verification

- CRUD feature tests cover validation, uniqueness, authorization, and deactivation.
- Pagination and filters run server-side.
- Customer credit changes include old and new values in the audit record.

### Exit criteria

- All master records required by stock transactions can be created and selected.
- Seed data supports realistic inventory and sales test scenarios.

---

## 8. Phase 3 — Core Warehouse Inventory

### SRS coverage

FR-010 through FR-012, FR-024, FR-025; BR-001, BR-003, BR-012 through BR-015.

### Current implementation checkpoint

- Phase 3 is complete across InnoDB balance storage, append-only movement history, human-readable references, idempotent transaction commands, and warehouse-scoped query APIs.
- Draft imports support multi-product editing without changing stock; posting and authorized void/reversal are atomic, audited, immutable after posting, and fully traceable.
- Increase/decrease adjustments require reasons, use independently authorized commands, lock current balances, and reject deductions that would make stock negative.
- The compact SPA inventory workspace provides on-hand, imports, adjustments, and movement-history registers with server-side filters, responsive transaction dialogs, and deployment-directory-safe routes.
- Fast feature coverage passes on SQLite, while the dedicated two-process concurrency check passes on MariaDB 10.4.32/InnoDB with a proven overlapping row-lock wait.
- Current balances reconcile to their applicable movement ledger in automated fixtures. Phase 4 is next.

### Deliverables

#### Inventory foundation

- `warehouse_inventories` current-balance table.
- Unique `warehouse_id + product_id` constraint.
- Append-only `stock_movements` ledger.
- Inventory query endpoints scoped by accessible warehouse.
- Human-readable, unique transaction references.

#### Stock imports

- Draft stock import creation and editing.
- Atomic posting that increases warehouse stock and writes movements.
- Posted import immutability.
- Authorized void/reversal that preserves the original record and creates reversing movements.

#### Stock adjustments

- Increase and decrease adjustments with mandatory reason.
- Authorization separate from general inventory viewing.
- Stock validation and row locking for decreases.
- Audit entry and movement entry for every posted adjustment.

#### Inventory history

- Stock movement search by warehouse, product, type, reference, and date.
- Trace from a movement to its source transaction and actor.

### Transaction pattern

Each posting service must:

1. Begin a database transaction.
2. Lock or safely create the relevant balance row.
3. Recheck current state and quantity.
4. Validate allowed state transition and authorization.
5. Update the balance.
6. Insert movement and audit records.
7. Mark the document posted with timestamp and actor.
8. Commit as one unit; roll back on any failure.

### Verification

- Draft transactions do not affect stock.
- Posting the same transaction twice cannot increase stock twice.
- Decreasing below zero is rejected.
- Voiding a posted document restores the correct balance and retains both histories.
- Two concurrent deductions cannot create negative inventory.
- Balance equals the net applicable stock movements for test fixtures.

### Exit criteria

- Warehouse stock can be reconstructed and explained from its movement history.
- Imports, adjustments, and reversals pass concurrency and atomicity tests.

---

## 9. Phase 4 — Stock Transfers and Representative Inventory

### SRS coverage

FR-013 through FR-016; BR-002 through BR-007.

### Current implementation checkpoint

- Phase 4 is complete across warehouse transfers, representative issues, explicit in-transit custody, representative current balances, and the 100-unit per-product holding limit.
- Draft, dispatch, full receipt, cancellation, and controlled reversal commands use immutable documents, append-only movements, audit actors, idempotency keys, deterministic row locks, and stable conflict codes.
- Source warehouse scope is enforced for dispatch, destination scope for warehouse receipt, and linked-representative ownership for sales receipt; collection queries are scoped before filtering and pagination.
- The compact admin transfer workspace and representative stock/receiving workspace provide permission-aware actions, loading, empty, error, success, responsive, light/dark, and nested-deployment states.
- Repeatable demo data includes one received warehouse transfer, one received representative issue, and one pending representative issue with reconciled warehouse, representative, and in-transit totals.
- SQLite feature coverage and two-process MariaDB 10.4.32/InnoDB checks verify insufficient-stock serialization, limit serialization, idempotent receipt, valid state transitions, and full custody reconciliation. Phase 5 is next.

### Deliverables

#### Warehouse transfers

- Draft transfer from one warehouse to another.
- Dispatch action: source stock decreases and in-transit quantity increases.
- Receive action: in-transit quantity decreases and destination stock increases.
- Draft cancellation and controlled reversal/return rules after dispatch.
- Authorization at both source and destination warehouse stages.

#### Representative transfers

- Draft issue from a warehouse to a representative.
- Dispatch with sufficient-warehouse-stock validation.
- Representative pending-receiving list.
- Representative-only confirmation of their own transfer.
- Receive action that adds stock to the representative balance.
- Read-only representative stock page.

#### Representative holding limit

For every product, enforce atomically:

```text
current representative quantity
+ pending/in-transit incoming quantity
+ new quantity
<= 100
```

The limit must be validated when a transfer becomes capable of reserving/increasing incoming stock, not only when the representative receives it.

### Verification

- Insufficient warehouse stock is rejected.
- Warehouse transfer dispatch and receipt produce paired movement history.
- A representative cannot alter transfer lines or receive another person's transfer.
- Current 80 plus incoming 30 is rejected.
- Current 80 plus incoming 20 is accepted.
- Current 60 plus in-transit 30 plus new 20 is rejected.
- Two concurrent transfers cannot bypass the 100-unit limit.
- Receiving twice is idempotent or rejected without a second balance change.
- Stock remains traceable while in transit.

### Exit criteria

- Stock totals reconcile across warehouse, representative, and in-transit locations.
- Both transfer state machines reject invalid transitions.
- Representative limit tests pass under sequential and concurrent requests.

---

## 10. Phase 5 — Customer Sales

### SRS coverage

FR-017 through FR-019; BR-004, BR-008 through BR-010, and BR-016.

### Current implementation checkpoint

- Phase 5 is complete across server-priced sale drafts, atomic posting, customer credit control, representative cash hold, controlled voids, and append-only stock/financial ledgers.
- Representative identity and warehouse are derived from the authenticated account; active customers are restricted to that operating warehouse, and own sale history cannot be queried for another representative.
- Draft creation and posting use independent idempotency commands. Posted lines and preserved unit prices are immutable, while `sale.void` creates compensating stock and cash/credit entries with an actor and mandatory reason.
- The mobile-first representative workspace provides sale entry, stock-aware lines, credit/cash previews, draft editing, explicit posting, and own history. The admin register applies permission and warehouse scope before filters and pagination.
- Repeatable demo data includes posted cash and credit sales plus an editable draft, with exact stock, cash-hold, and customer-credit reconciliation after repeated seeding.
- SQLite feature coverage and two-process MariaDB 10.4.32/InnoDB checks verify full rollback, exact-once effects, simultaneous stock protection, and simultaneous customer-credit-limit protection. Phase 6 is next.

### Deliverables

- Representative new-sale workflow.
- Customer and active-product selection.
- Sale header and line items with preserved unit prices and calculated totals.
- Cash and Credit payment types only for version 1.
- Draft, Posted, and Voided statuses.
- Server-calculated totals; client totals are previews only.
- Atomic representative-stock deductions.
- Cash-sale entry that increases representative cash hold.
- Credit-sale entry that increases customer outstanding credit.
- Controlled sale void/reversal with compensating stock and financial entries.
- Representative sale history restricted to the signed-in representative.
- Duplicate-sale prevention for double-click, retry, or refresh.

### Credit validation

Within the posting transaction, lock the required records and enforce:

```text
credit_allowed = true

current outstanding + new credit sale <= credit limit
```

### Stock validation

Within the same posting transaction, lock each representative inventory row and enforce:

```text
available quantity >= requested quantity
```

Lock multiple product rows in a deterministic order to reduce deadlock risk.

### Verification

- Selling 15 when only 10 is held is rejected.
- Credit sale is rejected when credit is disabled.
- Credit sale is rejected when it exceeds available credit.
- A cash sale deducts stock and increases cash hold exactly once.
- A credit sale deducts stock and increases outstanding credit exactly once.
- A failed line or financial update rolls back the entire sale.
- Simultaneous sales cannot oversell the same product.
- Simultaneous credit sales cannot exceed the customer limit.
- Representatives cannot create or view sales as another representative.
- Posted sales cannot be edited directly.

### Exit criteria

- Sale, stock movement, cash/credit movement, and balances reconcile.
- All critical sale and credit concurrency tests pass.

---

## 11. Phase 6 — Customer Credit and Representative Cash

### SRS coverage

FR-020 through FR-023; BR-010 and BR-011.

### Current implementation checkpoint

- Phase 6 is complete across representative cash custody, pending handovers, office confirmation/reversal, customer outstanding balances, payment posting/voiding, and linked append-only ledgers.
- A representative sees and submits only against their own locked cash hold. Pending submissions reserve the available-to-submit amount but do not change cash hold; cancellation releases that reservation without a financial entry.
- Warehouse-scoped office commands independently enforce `cash.confirm`, `cash.reverse`, `customer_payment.create`, and `customer_payment.void`. Every posting command is idempotent, state checked, audited, and atomic.
- Customer payment drafts preserve amount, date, method, external reference, notes, and receiver. Posting rejects overpayment by default; voiding restores outstanding credit with a reason-required ledger entry linked to the original payment transaction.
- Compact representative and office SPA workspaces support mobile/desktop, light/dark, dense tables/cards, payment and cash dialogs, immutable status history, and permission-aware actions under flexible deployment paths.
- Repeatable seed reconciliation and genuine two-process MariaDB 10.4.32/InnoDB contention checks prove exact balances, neutral pending/draft states, linked reversals, one-winner cash confirmations, and one-winner customer settlements. Phase 7 is next.

### Deliverables

#### Representative cash

- Append-only representative cash transaction history.
- Current cash-hold calculation or safely maintained balance.
- Representative cash-hold view.
- Pending cash submission initiated by the representative.
- Office confirmation that atomically reduces cash hold.
- Rejection of submissions above current cash hold.
- Duplicate-confirmation protection.

#### Customer credit

- Customer outstanding-credit view.
- Authorized office customer payment/credit settlement.
- Payment amount, date, method, reference, notes, and receiver.
- Atomic reduction of customer outstanding balance.
- Rejection of payment above outstanding credit unless an explicit overpayment policy is approved later.
- Controlled reversal of incorrectly posted payments.

### Important policy

Pending cash submission does not reduce cash hold. Cash hold changes only after authorized office confirmation.

### Verification

- Cash hold 500,000 with confirmed submission 400,000 leaves 100,000.
- Submission above current hold is rejected.
- Two confirmations cannot reduce cash twice.
- Customer payment reduces outstanding credit without going below zero.
- Failed confirmation or payment leaves all balances unchanged.
- Representatives can see only their own cash information.
- Financial transactions retain actor, timestamps, reference, status, and reversal link.

### Exit criteria

- Cash hold and customer outstanding balances reconcile to their transaction histories.
- Confirmation, settlement, and reversal workflows pass authorization and concurrency tests.

---

## 12. Phase 7 — Dashboards, Reports, and Auditability

### SRS coverage

FR-026 through FR-030; NFR-007 and NFR-008.

### Current implementation checkpoint

- Phase 7 is complete across warehouse-scoped admin KPIs, authenticated representative KPIs, eight operational/financial reports, and authorized audit history.
- Dashboard financial totals use posted sales only. Report registers show every document status unless filtered, while financial and unit summaries use posted sales only; posted documents use `posted_at` and other document rows use `created_at`.
- Admin report and audit queries apply accessible-warehouse scope before filters or aggregation. Representative endpoints derive ownership from the authenticated user and never accept a representative scope parameter.
- Every collection is filtered, sorted, and paginated by the server. Composite MariaDB indexes cover common sale, transfer, and audit filters; query-count coverage and explicit MariaDB range-plan checks protect the main aggregation paths.
- The compact light/dark SPA exposes admin dashboard, reports, audit log, representative dashboard, and own-sales report routes with loading, empty, error, retry, responsive, and nested-deployment behavior. Phase 8 is next.

### Deliverables

#### Admin dashboard

- Warehouse-scoped KPI cards.
- Accessible-warehouse filter.
- Today's total, cash, and credit sales.
- Current warehouse stock, customer credit, representative cash, and pending-transfer summaries.

#### Representative dashboard

- Current stock summary.
- Pending receiving.
- Today's cash, credit, and total sales.
- Current cash hold.

#### Reports

- Warehouse stock.
- Representative stock.
- Stock movements.
- Warehouse transfers.
- Representative transfers.
- Sales, including cash/credit and units sold.
- Representative cash hold.
- Customer credit and available credit.

#### Audit tools

- Searchable audit log for authorized administrators.
- Actor, action, module, record, timestamp, and old/new values where appropriate.
- Links from audit records to supported source records.

### Reporting requirements

- Server-side pagination, filtering, and sorting.
- Warehouse scope applied before aggregation.
- Consistent date/timezone and money formatting.
- Database indexes verified against common report filters.
- Large exports, if added, run without loading entire datasets into the browser.

### Verification

- Dashboard totals match underlying posted transactions.
- Draft, cancelled, and voided records are included or excluded according to documented report rules.
- Office Admin report results contain only assigned warehouses.
- Representative report results contain only that representative's records.
- Queries remain efficient with realistic seeded data volumes.

### Exit criteria

- Every management objective in SRS section 3 can be answered from a dashboard or report.
- Report totals reconcile with balance and ledger records.

---

## 13. Phase 8 — PWA, UX, Performance, and Hardening

### SRS coverage

NFR-001 through NFR-010 and SRS sections 66–72.

### Current implementation checkpoint

- Phase 8 is complete across installable nested-deployment PWA metadata, production asset precaching, a read-only cached shell, explicit connection status, and redundant client-side prevention of offline stock/money mutations without a background queue.
- Compact admin desktop/tablet and representative Android/iPhone workflows pass rendered light/dark, overflow, touch-target, keyboard-dialog, and automated accessibility checks.
- Request correlation, structured logging, liveness/readiness, CORS, throttling, security headers, authorization regression, sensitive-data/mass-assignment review, and dependency audits form the hardening baseline.
- MariaDB indexes and realistic-volume query gates pass, route-level chunks and immutable hashed-asset caching are verified, all stock/financial contention checks remain green, and automated backup restoration produces a usable database.
- Phase 8 exit criteria are satisfied with no known critical or high-severity defect. Phase 9 repository implementation is complete and awaits external rollout evidence.

### Deliverables

#### PWA and offline behavior

- Web app manifest, icons, service worker, installability, and application-shell caching.
- Clear global online/offline status.
- Previously loaded shell may open offline.
- All inventory- and money-changing actions are disabled offline with the required connection message.
- No offline mutation queue or offline stock synchronization in version 1.

#### Responsive UX

- Mobile-first representative workflows.
- Desktop/tablet-first admin workflows with responsive fallback.
- Loading, empty, validation, failure, success, and retry states.
- Accessible keyboard navigation, labels, focus states, contrast, and touch targets.
- Submit buttons lock while processing.

#### Security and reliability

- Dependency and security review.
- CSRF, session, CORS, cookie, rate-limit, and production-header review.
- Sensitive-data and mass-assignment review.
- Authorization regression suite for all endpoints.
- Backup and restore procedure documented and tested.
- Structured error logging and production monitoring approach.

#### Performance

- Database indexes reviewed using realistic queries.
- N+1 query checks and query-count review.
- Pagination applied to all large collections.
- Frontend route/code splitting where useful.
- Production asset build and caching verified.

### Verification

- Installability passes supported-browser checks.
- Offline mutation attempts cannot reach successful completion.
- Admin and representative critical paths work on desktop, tablet, Android-sized, and iPhone-sized viewports.
- Accessibility and production build checks pass.
- Load tests cover common reads and simultaneous stock/sale postings at expected business volume.
- Backup restoration produces a usable application database.

### Exit criteria

- Functional, security, performance, responsive, and PWA acceptance checks pass.
- No unresolved critical or high-severity defect remains.

---

## 14. Phase 9 — Production Readiness and Rollout

### Objective

Deploy safely, validate real operational flows, and establish ownership after launch.

### Deliverables

- Production environment and deployment runbook.
- Secure environment configuration and secret management.
- Database migration and rollback procedure.
- Initial master-data import templates and validation.
- User/role/warehouse assignment checklist.
- Backup schedule and restore ownership.
- Monitoring, alerting, and incident-response contacts.
- Administrator and representative user guides.
- User acceptance testing with representative business scenarios.
- Controlled pilot using a limited warehouse/representative group.
- Go-live checklist and post-launch verification.

### Exit criteria

- Business owners sign off on UAT and opening balances.
- Production backup and restore are verified.
- Pilot stock, cash, and credit balances reconcile.
- Support ownership and issue escalation are documented.

### Current checkpoint — 17 August 2026

Repository implementation is complete: production configuration/runbooks, validated rollout templates, access and operational checklists, user guides, UAT/pilot/go-live plans, scheduled backup/readiness checks, balance reconciliation, and the evidence-backed production gate are implemented and tested. Actual completion remains dependent on named business and operations owners executing UAT, opening-balance approval, production restore verification, pilot reconciliation, and post-launch sign-off in the target environment.

---

## 15. Mandatory Test Gate

The following SRS cases must be automated at the service or feature-test level before release:

| Case | Expected result |
|---|---|
| Warehouse has 50; transfer requests 60 | Rejected |
| Representative has 80; incoming 30 | Rejected |
| Representative has 80; incoming 20 | Accepted; final 100 |
| Representative has 60, in transit 30, new 20 | Rejected |
| Representative has 10; sale requests 15 | Rejected |
| Customer credit disabled; credit sale attempted | Rejected |
| Limit 1,000,000, outstanding 800,000, new credit sale 300,000 | Rejected |
| Cash sale 200,000 | Cash hold increases 200,000 |
| Cash hold 500,000; confirmed submission 400,000 | Cash hold becomes 100,000 |
| Warehouse 50; simultaneous deductions 40 and 30 | Only a valid request succeeds; never negative |

Additional release-critical cases:

- Duplicate import, transfer dispatch, receipt, sale, payment, and cash confirmation do not apply twice.
- Invalid state transitions are rejected.
- A partial failure rolls back balance, ledger, document, and audit changes.
- Concurrent representative transfers cannot bypass the 100-unit limit.
- Concurrent credit sales cannot bypass the customer credit limit.
- Posted records cannot be directly edited or deleted.
- Reversals produce complete links and compensating entries.
- Warehouse and representative data isolation cannot be bypassed through API parameters.

---

## 16. Traceability Summary

| Requirement group | Primary phase |
|---|---|
| Authentication, roles, permissions, warehouse assignments | Phase 1 |
| Products, warehouses, representatives, customers, vehicles | Phase 2 |
| Imports, warehouse inventory, adjustments, movements | Phase 3 |
| Warehouse transfers, representative transfers, receiving, 100-unit limit | Phase 4 |
| Customer sales, stock deduction, cash/credit validation | Phase 5 |
| Customer payments, outstanding credit, cash hold, submissions | Phase 6 |
| Reports, dashboards, audit-log access | Phase 7 |
| PWA, responsive behavior, offline restrictions, performance, security | Phase 8 |
| Deployment, UAT, backup, rollout | Phase 9 |

---

## 17. Definition of Done

A feature is done only when all applicable conditions are true:

- Acceptance behavior is agreed and implemented.
- Backend authentication, authorization, warehouse scope, and ownership are enforced.
- Backend and frontend validation are present.
- Transaction boundaries and row locks are used where balances can change.
- Duplicate-submission behavior is safe.
- Stock, cash, credit, audit, and reversal records are complete where applicable.
- Database constraints and indexes are included in migrations.
- Automated happy-path, validation, authorization, rollback, and concurrency tests pass.
- UI includes loading, empty, error, success, and responsive states.
- API and operational documentation is updated.
- Formatting, static analysis, tests, and production builds pass.
- No posted transaction can be silently changed or deleted.

---

## 18. Initial Implementation Backlog

The first executable work package should be completed in this order:

1. Bootstrap Laravel, React, Vite, test tooling, and environment documentation.
2. Finalize the entity-relationship diagram and transaction state diagrams.
3. Create users, roles, permissions, warehouses, and assignment migrations.
4. Implement Sanctum authentication and inactive-user enforcement.
5. Implement permission, warehouse-scope, and representative-ownership policies.
6. Build separate admin and representative application shells.
7. Add automated authorization tests before adding business modules.
8. Implement master data in dependency order: warehouses, products, vehicles, customers, representatives.
9. Seed realistic roles, permissions, warehouses, products, customers, and representative users.
10. Begin Phase 3 only after the foundation and master-data exit criteria pass.

---

## 19. Open Decisions to Resolve in Phase 0

These items are not fully specified by the SRS and should be explicitly decided before their affected feature is built:

- Exact Laravel, PHP, Node.js, React, and database versions.
- TypeScript versus JavaScript for the React application.
- Permission package versus first-party permission tables.
- Single primary role versus multiple roles per user.
- MMK stored as whole units or fixed-precision decimal, including rounding policy.
- Whether selling price may be overridden by representatives and, if so, within what permission/range.
- How in-transit stock is persisted versus derived.
- Reservation point for representative incoming stock and its cancellation/reversal behavior.
- Who may receive warehouse-to-warehouse transfers at the destination.
- Partial receipt, damaged-in-transit, and quantity-discrepancy policy.
- Sale and financial reversal permissions and reporting treatment.
- Customer payment methods and overpayment policy.
- Reference-number sequencing scope and behavior under rollback.
- Required production database, hosting platform, backup retention, and recovery targets.
- Required languages, locale, timezone storage/display, and number/date formats.

Decisions that alter business behavior should be added to the SRS or recorded as approved architecture/business decision records before implementation.

---

## 20. Scope Control

The following remain outside version 1 unless the SRS is formally changed:

- Foreign procurement, suppliers, customs, and import documentation.
- Full accounting, general ledger, payroll, HR, and manufacturing.
- Complex approvals, CRM, route optimization, and GPS tracking.
- Offline transaction synchronization.
- Mixed payments, advanced tax, and complex multi-currency accounting.

New requests should first be checked against this boundary. Work that changes stock, money, permissions, or transaction states requires updated acceptance criteria and regression tests before entering a phase backlog.
