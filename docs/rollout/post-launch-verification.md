# Post-launch Verification

## First 30 minutes

- Verify liveness/readiness, HTTPS/security headers, release identity, login portals, queue/scheduler activity, structured logs, and external monitoring.
- Confirm no elevated 401/403/419/429/500 rate and correlate any error with request IDs.
- Run pilot-scoped readiness and compare opening warehouse, representative, transit, cash, credit, and sales totals.

## End of first day

- Reconcile physical pilot stock, all posted sale references, representative cash handovers, customer payments, and pending transfers.
- Confirm the scheduled backup exists, is off-host, non-zero, monitored, and assigned for restore verification.
- Review new/deactivated accounts and sensitive permissions against approvals.
- Classify defects and decide continue, restrict scope, or rollback with named owners.

## Closeout

Technical and business owners attach monitoring, backup/restore, reconciliation, incident/defect, and support-handover references, then complete the private `post_launch` sign-off section. Run `php artisan inventory:readiness --production --stage=final --json`; the rollout closes only when it returns `ready`. Keep enhanced monitoring through the agreed stabilization window.
