# Authorization Matrix

**Status:** Phase 0 baseline; Phase 1 will convert this matrix into seeded permissions and automated policy tests.

Legend:

- **All:** unrestricted record scope for the feature.
- **Assigned:** only records belonging to an assigned warehouse.
- **Own:** only the authenticated representative's records.
- **Permission:** available only when explicitly granted to the Office Admin role.
- **No:** prohibited even if a frontend control is manipulated.

| Capability | Super Admin | Office Admin | Sales Representative |
|---|---|---|---|
| View admin dashboard | All | Permission + Assigned | No |
| Manage users and roles | All | Permission | No |
| Assign warehouses | All | Permission, within allowed administration scope | No |
| View warehouses | All | Permission + Assigned | Primary warehouse context only |
| Create/edit/deactivate warehouses | All | Permission | No |
| View/manage products | All | Permission | View active sale-eligible products only |
| View warehouse inventory | All | Permission + Assigned | No |
| View representative inventory | All | Permission + Assigned | Own, read-only |
| Create/post/void stock import | All | Permission + Assigned | No |
| Create/post stock adjustment | All | Permission + Assigned | No |
| Create warehouse transfer | All | Permission + source Assigned | No |
| Dispatch warehouse transfer | All | Permission + source Assigned | No |
| Receive warehouse transfer | All | Permission + destination Assigned | No |
| Create representative transfer | All | Permission + source Assigned | No |
| Dispatch representative transfer | All | Permission + source Assigned | No |
| Confirm representative receipt | All for support permission | No by default | Own only |
| Reverse representative transfer | All | Explicit issue permission + source Assigned | No |
| Manage representatives | All | Permission + Assigned | Own profile view only |
| Manage vehicles | All | Permission | No |
| View/manage customers | All | Permission + allowed business scope | View active sale-eligible customers |
| Change credit allowed/limit | All | Explicit `customer.credit_manage` | No |
| View sales | All | Permission + Assigned | Own only |
| Create customer sale | Support permission only | No by default | Own only |
| Void sale | All | Explicit permission + Assigned | No by default |
| View representative cash | All | Permission + Assigned | Own only |
| Initiate cash submission | Support permission only | No by default | Own only |
| Confirm cash submission | All | Explicit permission + Assigned | No |
| Reverse confirmed cash submission | All | Explicit permission + Assigned | No |
| Record customer payment | All | Explicit permission + Assigned | No |
| Void posted customer payment | All | Explicit permission + Assigned | No |
| View reports | All | Permission + Assigned | Own reports only |
| View audit logs | All | Explicit permission + Assigned where applicable | No |

## Scope resolution rules

1. Frontend route guards are not authorization controls.
2. Route model binding must not disclose an out-of-scope record.
3. Collection queries apply scope before filters, sorting, pagination, or aggregation.
4. A user assigned to two warehouses sees the union of those warehouse scopes only.
5. A representative's linked `user_id` is the source of ownership; representative IDs from request bodies are not trusted.
6. An inactive user cannot authenticate. Deactivation never removes historical actor relationships.
7. Super Admin warehouse access is global, but business validation and document-state rules still apply.

## Initial permission namespaces

```text
dashboard.view
warehouse.view, warehouse.create, warehouse.edit
product.view, product.create, product.edit
inventory.view, inventory.import, inventory.adjust
warehouse_transfer.view, warehouse_transfer.create
warehouse_transfer.dispatch, warehouse_transfer.receive, warehouse_transfer.reverse
representative.view, representative.create, representative.edit
representative_stock.view, representative_stock.issue, representative_stock.receive
customer.view, customer.create, customer.edit, customer.credit_manage
sale.view, sale.create, sale.void
cash.view, cash.submit, cash.confirm, cash.reverse
customer_payment.view, customer_payment.create, customer_payment.void
vehicle.view, vehicle.create, vehicle.edit
report.view
audit.view
user.manage, role.manage
```

Phase 1 should keep names as constants or enums and test every protected route against this matrix.
