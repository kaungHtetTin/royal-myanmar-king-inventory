# Database Migration and Rollback Procedure

## Before migration

1. Review every pending migration and its `down()` behavior against production volume and MariaDB/MySQL compatibility.
2. Confirm disk space, replication/backup health, maintenance window, and the database/recovery owner.
3. Create and checksum `pre-deploy-<deployment-id>.sql`; restore it into an isolated database and retain the evidence.
4. Run `php artisan migrate:status` and save the pending list.
5. Stop writes with maintenance mode and allow active requests/workers to finish.

## Apply

```bash
php artisan migrate --force
php artisan migrate:status
php artisan optimize
php artisan inventory:readiness --production --stage=preflight --json
```

Do not manually edit the `migrations` table. Long-running schema changes require a separately rehearsed online migration plan.

## Rollback decision

- If traffic never resumed and the migration is explicitly reversible without losing new data, the database owner may run `php artisan migrate:rollback --step=1 --force`, inspect the schema, and restore the previous release.
- If traffic resumed, balances or transactions changed, or `down()` drops/transforms data, do not use migration rollback. Restore the verified backup into a new database, run reconciliation/readiness against it, then switch traffic under the incident plan.
- Always create an incident-time backup before restore, even when the current data is faulty.

The technical owner and database recovery owner jointly record the chosen path, timestamps, affected migration names, backups/checksums, validation results, and final deployment ID.
