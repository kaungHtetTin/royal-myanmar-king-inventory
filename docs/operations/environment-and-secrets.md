# Production Environment and Secret Management

## Secret boundary

Store `APP_KEY`, current/previous keys, database credentials, initial administrator password, mail credentials, backup encryption credentials, and monitoring credentials in the approved secret manager. Grant retrieval only to the deployment identity and named emergency operators. Repository files, CI logs, browser storage, support tickets, and rollout CSVs must never contain these values.

`.env.production.example` is the configuration contract, not a usable environment. Values containing `<...>` deliberately fail production readiness. Use `--stage=preflight` before enabling traffic and `--stage=final` only after post-launch evidence is recorded.

## Required controls

- Use a unique non-root database user with only the schema/data privileges the application needs.
- Set `APP_ENV=production`, `APP_DEBUG=false`, HTTPS `APP_URL`, explicit credentialed CORS origins, encrypted sessions, secure/HTTP-only cookies, and the exact nested `SESSION_PATH` where applicable.
- Use `LOG_STACK=structured`; forward JSON logs over authenticated transport and redact request bodies, cookies, authorization headers, credentials, and secrets.
- Record `APP_VERSION` and an immutable `DEPLOYMENT_ID` in every release. `/api/health` exposes these non-secret identifiers for verification.
- Define named business, technical, security, incident, escalation, and database-recovery contacts. Group names without a supported contact path are not accepted.

## Rotation

Rotate database/backup/monitoring credentials on staff changes, suspected exposure, and the approved periodic schedule. Rotate `APP_KEY` only through Laravel's previous-key procedure: retain the old value temporarily in `APP_PREVIOUS_KEYS`, deploy and verify decryption, then remove it after the agreed session/data window. Initial passwords are one-time values delivered outside email/chat and must be changed by the user.

After rotation, clear cached configuration, restart workers, run production readiness, and record the secret version—not its value—in the change record.
