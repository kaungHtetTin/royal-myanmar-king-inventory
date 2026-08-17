# Phase 8 Security Review

**Reviewed:** 17 August 2026  
**Scope:** Laravel API, React SPA/PWA, MySQL/MariaDB deployment baseline

## Outcome

No known critical or high-severity defect remains in the reviewed Phase 8 scope. The automated route audit confirms that every `/api/admin/*` and `/api/sales/*` business endpoint retains authentication, active-account enforcement, and its portal-specific permission or representative-role middleware.

## Controls reviewed

| Area | Result |
|---|---|
| Authentication | Same-origin Sanctum session authentication; inactive users and portal mismatch rejected; login throttling retained. |
| CSRF | Laravel/Sanctum CSRF cookie flow and Axios `X-XSRF-TOKEN` handling apply to state-changing SPA requests. |
| Sessions/cookies | Database-backed sessions, HTTP-only cookies, SameSite `lax`; production requires `SESSION_SECURE_COOKIE=true` over HTTPS. |
| CORS | Credentialed requests are limited to explicit `CORS_ALLOWED_ORIGINS`; accepted and exposed headers are enumerated. |
| API rate limit | Authenticated-user/IP limiter is 120 requests per minute and the API middleware group includes `throttle:api`. |
| Response headers | MIME sniffing, framing, referrer, permissions, opener isolation, and legacy cross-domain policy headers are set. Production adds CSP and HSTS on secure requests. |
| Authorization | Middleware regression covers more than 50 business routes. Policies/services continue to apply warehouse scope and representative ownership. |
| Mass assignment | Models use explicit `$fillable` lists. No controller/service use of unfiltered `request()->all()`, `$request->all()`, or request-wide model create/update was found. Transaction-owned actor, status, balance, and ledger fields are assigned by services after validation and authorization. |
| Sensitive data | Password and remember-token fields are hidden, passwords use Laravel's hashed cast, and the serialization regression confirms neither field is returned. Logs must not include request bodies, cookies, CSRF values, passwords, or database credentials. |
| Offline identity | The PWA caches the last non-secret user profile only to render a read-only offline shell. It does not cache session cookies or tokens. Server authorization remains authoritative and every mutation is disabled and rejected before transport while offline. |
| Logs | Daily JSON logs include request ID, authenticated user ID where available, route, level, exception, and context. Responses expose the request ID for support correlation. |
| Dependencies | `composer audit --locked --format=summary` reported no advisories during the Phase 8 review; `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities. Available major toolchain upgrades are deferred to a controlled Phase 9 compatibility review. |

## Production requirements

- Set `APP_ENV=production`, `APP_DEBUG=false`, a unique `APP_KEY`, HTTPS, secure cookies, explicit CORS origins, and the structured log channel.
- Terminate HTTP at HTTPS and verify HSTS/CSP on the public hostname before rollout.
- Store database and backup credentials outside source control; encrypt and restrict off-host backups.
- Forward JSON logs to the approved monitor, configure alert ownership, and never expose the readiness endpoint beyond the intended monitoring boundary without network controls.
- Re-run dependency audits, the full authorization suite, browser acceptance, concurrency tests, and restore verification for every release candidate.

## Deferred, non-blocking work

- PHP 8.3+/Laravel 13 and available frontend build-tool majors require an isolated compatibility branch and full transaction regression; no unsupported in-place major upgrade is part of Phase 8.
- Final hosting controls, central log destination, incident contacts, secret store, backup owner, and RPO/RTO require production-owner approval in Phase 9.
