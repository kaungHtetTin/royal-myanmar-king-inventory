# Monitoring and Error Logging

## Health signals

- `GET /up` is the process liveness probe. It must not depend on downstream services.
- `GET /api/health` is the readiness probe. It returns HTTP 200 only when both database and cache read/write checks pass; otherwise it returns HTTP 503 with `status: degraded`. It also identifies the non-secret version and deployment ID.
- Poll readiness every minute from outside the application host and alert after three consecutive failures.

## Structured logs

Set `LOG_STACK=structured`, `LOG_LEVEL=info`, and `APP_DEBUG=false` in production. The structured channel writes daily JSON logs with request ID, authenticated user ID when available, route, message, level, exception class, and application context. Retain local logs for 14 days and forward them to the approved central log service.

Every dynamic response includes `X-Request-ID`. Support staff should capture this ID when reporting an error so the corresponding request can be found without exposing passwords, session cookies, CSRF tokens, or full request payloads.

## Alert thresholds

- Any readiness failure: warning; three consecutive failures: critical.
- Any unhandled exception or HTTP 500 burst above five in five minutes: critical.
- Authentication throttling spike or repeated cross-warehouse authorization failures: security warning.
- Backup older than 26 hours, zero-byte backup, or failed restore verification: critical.
- Queue backlog older than five minutes or failed jobs above zero: warning.
- Disk usage above 80%: warning; above 90%: critical.

The scheduler appends an hourly `inventory:readiness --production --stage=preflight --json` result to `storage/logs/readiness.log`. This ongoing operational check excludes the one-time post-launch approval but retains environment, backup, assignment, and reconciliation gates. Forward this file and structured application logs off-host; alert on any `not_ready` result.

Named ownership is mandatory: `TECHNICAL_OWNER_CONTACT` owns service recovery, `SECURITY_CONTACT` owns suspected security events, `INCIDENT_PRIMARY_CONTACT` triages alerts, `INCIDENT_ESCALATION_CONTACT` is the next escalation, and `DATABASE_RECOVERY_OWNER` controls restores. The operator records the actual monitoring destination and on-call schedule in the controlled deployment record.
