# Go-live Checklist

## Governance

- [ ] Business, technical, security, incident, escalation, and database recovery owners are named and reachable.
- [ ] UAT, opening balances, restore, and pilot evidence are signed; no critical/high defect is open.
- [ ] Change window, communication, rollback decision owner, and support coverage are approved.

## Release and infrastructure

- [ ] Immutable release/version/deployment ID and dependency audit evidence are recorded.
- [ ] HTTPS, public document root, secure session/CORS/log configuration, non-root DB user, queue supervision, and scheduler are verified.
- [ ] Pre-deployment backup is encrypted, off-host, checksummed, and successfully restored.
- [ ] Migrations reviewed; rollback/restore choice and previous artifact are ready.

## Data and access

- [ ] Rollout CSV validation passes and source checksums are archived.
- [ ] Master counts, identifiers, roles, permissions, warehouse assignments, and one-time credential delivery are dual-reviewed.
- [ ] Posted opening imports equal signed physical balances; pilot reconciliation has zero mismatches.

## Traffic-enablement preflight gate

```bash
php artisan inventory:readiness --production --stage=preflight --json
```

- [ ] Preflight status is `ready`; JSON evidence is attached to the release.
- [ ] `/up` and `/api/health` show correct version/deployment ID.
- [ ] Admin and representative smoke tests pass before general user communication.

After traffic is enabled, execute `post-launch-verification.md`, record its approval, and run `inventory:readiness --production --stage=final --json` to close the rollout.
