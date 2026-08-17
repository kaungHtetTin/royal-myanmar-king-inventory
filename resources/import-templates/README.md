# Rollout Data Templates

These seven CSV files prepare the initial rollout dataset without bypassing application transaction rules. The included row in each file is illustrative; replace it with approved business data before validation.

## Validation

```bash
php artisan inventory:validate-rollout-data /secure/path/to/rollout-data
php artisan inventory:validate-rollout-data /secure/path/to/rollout-data --json
```

Validation is read-only. It checks exact headers, field formats, positive/whole-MMK values, duplicate identifiers, and cross-file warehouse/product/vehicle references. Existing identifiers are rejected unless `--allow-existing` is explicitly used for a controlled re-validation.

## Controlled loading order

1. Validate a read-only copy and archive its checksum.
2. Create warehouses, products, and vehicles through their permissioned admin screens.
3. Create customers and credit settings through customer administration.
4. Create representatives and office users through the access/representative screens so password handling, roles, assignments, and audit history remain intact.
5. Compare record counts and identifiers to the signed source files.
6. Enter `opening-stock.csv` as draft Stock Import documents. A second person compares draft lines to the approved opening balance before authorized posting.
7. Run `php artisan inventory:readiness --warehouse=PILOT-WH --json` and archive the output.

Do not add passwords, tokens, database credentials, or secret-manager values to these CSV files. Do not load opening quantities by editing balance tables or generic model imports.
