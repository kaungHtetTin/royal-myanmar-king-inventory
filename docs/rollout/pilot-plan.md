# Controlled Pilot Plan

## Scope and entry criteria

Use one approved warehouse and the smallest representative/customer/product set that exercises stock, cash, and credit. Configure `PILOT_WAREHOUSE_CODE` and `PILOT_REPRESENTATIVE_CODE`. Entry requires passed CI, production readiness except future sign-offs, validated source CSVs, restored backup evidence, trained users, support coverage, and signed opening balances.

## Sequence

1. Freeze and checksum approved pilot master/opening data.
2. Provision least-privilege accounts and verify portal/scope boundaries.
3. Load master data through audited admin screens; enter opening stock as draft imports and dual-review before posting.
4. Run and archive:

```bash
php artisan inventory:readiness --warehouse=<pilot-code> --json
```

5. Pilot warehouse operations for the approved observation period. Reconcile physical warehouse stock, representative custody, in-transit stock, cash handovers, and customer credit daily.
6. Log defects with severity, request ID, reference, owner, workaround, and disposition. Critical/high defects stop the pilot and block go-live.
7. Repeat readiness after every correction and at pilot close.

## Exit/abort

Pilot passes only when stock, cash, credit, sale lines, and in-transit checks show zero mismatches; users complete UAT; monitoring/backup alerts are exercised; no critical/high defect remains; and business/technical owners sign the evidence. Abort on unexplained balance difference, authorization leakage, duplicate effect, missing audit history, unusable backup, or unowned critical alert.

Pilot sign-off must name the warehouse/representative exactly as production configuration and be recorded in the private Phase 9 evidence JSON.
