# User, Role, and Warehouse Assignment Checklist

Complete for every production user and attach the exported/printed review to the rollout record.

## Before account creation

- [ ] Named manager approves the person's identity, portal, role, permissions, and warehouse scope.
- [ ] Username and optional email are unique and verified.
- [ ] Least privilege is used; stock, sale void, cash confirmation, payment void, credit management, role management, and audit access are independently justified.
- [ ] Representative has one active profile, one primary warehouse, and no conflicting vehicle assignment.

## Provisioning

- [ ] Super Admin is limited to named system owners; Office Admin has explicit warehouse assignments.
- [ ] Representative account has only the sales-representative role and a warehouse assignment matching the profile's primary warehouse.
- [ ] One-time password is generated/delivered through the approved private channel and is not stored in rollout CSVs or tickets.
- [ ] User successfully signs into only the intended portal and cannot access an unassigned warehouse or another representative's records.
- [ ] Provisioner and reviewer are different people for Super Admin and financial permissions.

## Removal/change

- [ ] Role/warehouse changes have manager approval and are reviewed immediately after saving.
- [ ] Departed or suspended users are deactivated; historical users/transactions are not deleted.
- [ ] Vehicle and operational handover is recorded before representative deactivation.
- [ ] Quarterly access review confirms active users, Super Admin list, independent financial permissions, warehouse scope, and inactive accounts.

Run `php artisan inventory:readiness --production --stage=preflight --json`; `office_assignments` and `representative_assignments` must pass.
