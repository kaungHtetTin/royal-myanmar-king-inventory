# Phase 9 Status — Production Readiness and Controlled Rollout

**Status:** Implementation complete; controlled rollout sign-off pending

## Implemented

- Secure production environment contract and nested-directory deployment runbook.
- Migration, rollback, backup, restore, monitoring, alerting, incident, and support procedures.
- Strict, cross-referenced CSV validation contracts for master data, assignments, and opening stock without bypassing audited transaction workflows.
- User/role/warehouse assignment checklist plus administrator and representative guides.
- UAT scenarios, controlled pilot plan, go-live checklist, and post-launch verification checklist.
- Daily backup and hourly production-readiness schedules with overlap protection.
- A release gate that validates environment hardening, owners, assignments, backup freshness, InnoDB, migrations, and warehouse/representative/in-transit/cash/credit/sale reconciliation.
- Release-bound private sign-off evidence validation for UAT, opening balances, restore, pilot, and post-launch approvals.
- A MySQL release-candidate workflow covering quality, assets, migrations, rollout validation, readiness, contention, reconciliation, performance, and restore verification.

## Commands

```bash
php artisan inventory:validate-rollout-data resources/import-templates
php artisan inventory:readiness --json
php artisan inventory:readiness --production --stage=preflight --json
php artisan inventory:readiness --production --stage=final --json
php artisan inventory:backup
php tests/mysql_phase8_backup_restore.php
```

The local readiness command is an implementation check. Production preflight authorizes traffic only after pre-launch evidence; final readiness additionally requires post-launch evidence and closes the rollout.

## Verified on 17 August 2026

- `composer quality`: 110 backend tests and 1,221 assertions passed; Pint passed.
- `npm run quality`: formatting, type checking, lint, and 37 frontend tests passed.
- `npm run build`: production asset build passed.
- Rollout validator: seven templates passed with zero errors and no database mutation.
- Local MariaDB readiness: 14 checks passed with zero balance mismatches.
- MariaDB contention, reconciliation, reporting/index, performance, and backup/restore scripts passed; the restored backup was usable.
- Workflow YAML parsed successfully and `npm audit --omit=dev --audit-level=high` found zero vulnerabilities.

## External exit evidence still required

- Named business-owner approval of UAT and posted opening balances.
- Successful backup restore against the production release/database shape, approved by the recovery owner.
- Controlled pilot reconciliation showing zero stock, in-transit, cash, credit, and sale-total mismatches.
- Post-launch health and smoke verification plus confirmed support/on-call ownership.

Copy `docs/rollout/phase9-signoff-template.json` into the configured private `ROLLOUT_SIGNOFF_EVIDENCE` path and replace every placeholder with real evidence references. Do not commit the completed file. Phase 9 is complete only when `inventory:readiness --production --stage=final --json` returns `ready` in the target environment.
