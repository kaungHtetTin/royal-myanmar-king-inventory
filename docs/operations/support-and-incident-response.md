# Support Ownership and Incident Response

Production contact values are configured through `BUSINESS_OWNER_CONTACT`, `TECHNICAL_OWNER_CONTACT`, `SECURITY_CONTACT`, `INCIDENT_PRIMARY_CONTACT`, `INCIDENT_ESCALATION_CONTACT`, and `DATABASE_RECOVERY_OWNER`. `inventory:readiness --production` rejects missing or placeholder owners.

## Severity and response

| Severity | Examples | Immediate action |
|---|---|---|
| Critical | Unauthorized data exposure, stock/money corruption, repeated duplicate effect, total outage, unusable recovery | Stop affected writes/traffic, page primary/security/technical owners, preserve evidence, start incident log and rollback decision. |
| High | Warehouse-scope leak, unexplained balance mismatch, sale/transfer/cash workflow blocked, backup/monitoring failure | Restrict affected scope, page primary/technical owner, reconcile, and block rollout expansion. |
| Medium | Degraded report, recoverable validation/UI issue with safe workaround | Ticket with owner/SLA; monitor and schedule a tested fix. |
| Low | Cosmetic/documentation/request | Normal backlog triage. |

## Incident record

Record detection time, reporter/contact, severity, deployment ID, request IDs, users/warehouses/references affected, symptoms, containment, commands, backups/checksums, reconciliation output, decisions/approvers, recovery time, and follow-up actions. Never paste passwords, cookies, tokens, full sensitive payloads, or secret values.

Only the database recovery owner performs production restore. Only the business owner accepts opening/pilot reconciliation. Only the technical owner closes post-launch verification. Security incidents require the named security contact and the approved notification process.
