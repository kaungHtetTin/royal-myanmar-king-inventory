# Production Deployment Runbook

## Release contract

Deploy an immutable, tested release artifact. Point the web server document root at the release's `public` directory; the application and PWA remain valid under a nested URL when `APP_URL` and `SESSION_PATH` match that deployment path. Database, cache, queue, scheduler, HTTPS, and off-host backup services must be available before traffic is switched.

Production values come from `.env.production.example` through the approved secret manager. Never copy the local `.env`, build tools, test credentials, or the example placeholders into production.

## Build and pre-deployment gate

Run in CI or a trusted build host:

```bash
composer install --no-dev --prefer-dist --no-interaction --classmap-authoritative
npm ci
composer quality
npm run quality
npm run build
composer audit --locked
npm audit --omit=dev --audit-level=high
```

Archive `composer.lock`, `package-lock.json`, `public/build`, application source, migration list, version, commit/deployment ID, and checksums as one release. The release approver records the successful CI run.

## First deployment

1. Provision a non-root MySQL/MariaDB account restricted to the production database and confirm every application table uses InnoDB.
2. Create the production environment from `.env.production.example`; inject secrets and named operational contacts through the approved secret store.
3. Create writable `storage` and `bootstrap/cache` paths owned only by the application service account.
4. Configure the web root to `public`, TLS, secure forwarding headers, request size/time limits, and denial of direct access to `.env`, storage, vendor, docs, and source files.
5. Run `php artisan key:generate` only for a new environment. Store the key in the secret manager before any encrypted data/session is created.
6. Run `php artisan migrate --force`, then `php artisan storage:link` only if public application uploads are later approved.
7. Configure one scheduler invocation per minute and supervised queue workers:

```cron
* * * * * cd /srv/inventory/current && php artisan schedule:run >> /dev/null 2>&1
```

8. Run the validated master-data/opening-balance workflow and pilot plan before broad access.

## Routine release sequence

```bash
php artisan inventory:validate-rollout-data /secure/rollout-data --allow-existing
php artisan inventory:backup --path=pre-deploy-<deployment-id>.sql
php artisan down --retry=60
php artisan migrate --force
php artisan optimize
php artisan queue:restart
php artisan inventory:readiness --production --stage=preflight --json
php artisan up
```

Do not bring traffic back when preflight returns `not_ready`. Resolve the failed check, rerun it, and attach the JSON output to the release record. Preflight requires evidence bound to the exact version/deployment ID for UAT, opening balances, restore, and pilot, but intentionally does not require the not-yet-possible post-launch approval. After traffic resumes, verify `/up`, `/api/health`, admin login, representative login, version/deployment ID, dashboards, and one permission-safe read from the pilot warehouse. Complete post-launch evidence, then run the final gate:

```bash
php artisan inventory:readiness --production --stage=final --json
```

## Release rollback

- Application-only fault: keep the database forward-compatible, switch the `current` release pointer to the previous tested artifact, run `php artisan optimize`, restart workers, and rerun readiness.
- Pending migration fault before traffic: correct or reverse only the unexposed migration using the procedure in `database-migrations.md`.
- Migration/data fault after traffic: enter maintenance mode, preserve logs, create an incident backup, and restore the verified pre-deployment backup into a new database. Never run a blind multi-step `migrate:rollback` against live transaction data.
- Record start/end time, decision owner, deployment IDs, database backup/checksum, commands, health results, and reconciliation output.

## XAMPP pilot/staging note

For the verified nested staging path, smoke-test `http://localhost/inventory/public/admin/login` and `http://localhost/inventory/public/sales/login`. XAMPP is not the production security boundary: production still requires TLS, a `public` document root, secure cookies, named owners, monitoring, and encrypted off-host backups.
