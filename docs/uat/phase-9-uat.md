# Phase 9 User Acceptance Test and Sign-off

Run against the release candidate with production-like configuration and the approved pilot dataset. Record actual references and attach screenshots/exported reports without secrets.

| ID | Actor | Scenario | Expected evidence |
|---|---|---|---|
| UAT-01 | Office Admin | Login and attempt an unassigned warehouse/API scope | Intended portal works; foreign scope is absent/403. |
| UAT-02 | Administrator | Create/deactivate a product and change customer credit | Validation, permissions, and audit old/new values are visible. |
| UAT-03 | Inventory operator | Draft/post an opening Stock Import | Draft is neutral; posted quantities and movements reconcile once. |
| UAT-04 | Two warehouse users | Dispatch and receive a warehouse transfer | Source, transit, destination, actors, and references reconcile. |
| UAT-05 | Office + representative | Issue/receive representative stock near the 100-unit limit | Valid total 100 succeeds; over-limit transaction is rejected. |
| UAT-06 | Representative | Post cash and credit sales; try insufficient stock/credit | Valid effects occur once; invalid sale changes nothing. |
| UAT-07 | Representative + office | Submit and confirm cash handover | Pending is neutral; confirmation reduces hold once. |
| UAT-08 | Finance user | Post and void a customer payment | Outstanding balance decreases/restores with linked history. |
| UAT-09 | Auditor | Reconcile dashboards/reports/audit against references | Posted-only totals, scope, actors, and source links match. |
| UAT-10 | Representative | Use Android/iPhone PWA, then disable network | Read-only shell appears; mutation controls cannot succeed offline. |
| UAT-11 | Recovery owner | Restore release backup to isolated database | Migration/count/balance/readiness evidence passes. |
| UAT-12 | Support | Trigger/correlate a safe validation error | User message, request ID, structured log, and escalation path work. |

## Mandatory SRS regression

Attach the full automated test output and MariaDB concurrency outputs covering insufficient warehouse stock, representative cap, insufficient representative stock, credit disabled/limit, exact cash hold, duplicate commands, invalid transitions, rollback, reversals, and cross-scope isolation.

## Sign-off

Business owner signs only after every row has Pass/Fail, evidence reference, tester, date, and resolved defect. Opening-balance approval is separate from functional UAT. Copy `docs/rollout/phase9-signoff-template.json` to the private `ROLLOUT_SIGNOFF_EVIDENCE` path, bind it to the exact `APP_VERSION` and `DEPLOYMENT_ID`, and enter the signed evidence references; never commit the completed file.
