# Database Backup and Restore

## Policy

- Production must create an encrypted, access-controlled MySQL/MariaDB backup at least daily, before every deployment that changes the schema, and before bulk opening-balance imports.
- Retain daily backups for 30 days and monthly backups for 12 months unless the approved production policy replaces these defaults.
- Store at least one copy outside the application host. Restrict backup access to the database owner and designated recovery operator.
- Monitor backup age, command exit status, file size, and restore-test status. A backup is not accepted until a restore test has succeeded.
- The scheduler runs `inventory:backup` daily at 01:30 `Asia/Yangon`; the platform owner must invoke `php artisan schedule:run` every minute and alert on missed or failed runs.
- `DATABASE_RECOVERY_OWNER` names the person accountable for restore decisions and evidence. Off-host retention, encryption, and access controls remain platform responsibilities.

## Create a backup

The command uses `mysqldump --single-transaction --quick --skip-lock-tables`, does not print the database password, and writes new files below the private storage directory by default.

```bash
php artisan inventory:backup
php artisan inventory:backup --path=pre-deploy.sql
```

Set `MYSQLDUMP_BINARY` when the binary is not on `PATH`. Copy the resulting file to encrypted backup storage after the command succeeds.

## Restore procedure

1. Put the application in maintenance mode and stop queue workers.
2. Confirm the target database name and save a separate pre-restore backup.
3. Create an empty UTF-8 database and import the selected SQL file with the matching MySQL/MariaDB client.
4. Point a non-public application instance at the restored database.
5. Run `php artisan migrate:status`, `php artisan about`, `php tests/mysql_phase6_reconciliation.php`, and `php tests/mysql_phase7_reporting.php` against that instance.
6. Verify administrator login, warehouse/product counts, posted sales totals, cash balances, customer outstanding balances, and the newest audit event.
7. Only then switch production traffic, restart workers, exit maintenance mode, and record the recovery evidence.

## Automated restore verification

```bash
php tests/mysql_phase8_backup_restore.php
```

The verifier creates a uniquely named `inventory_restore_verify_*` temporary database, restores a fresh backup, compares migrations and core business totals, then drops only that verified temporary database and removes its temporary SQL file.

For go-live, archive the backup checksum, command output, restored database identity, reconciliation output, verifier, date, and recovery-owner approval in the controlled evidence store. Put only the reference in the private sign-off JSON; never commit production data or credentials.
