# Administrator Guide

## Daily start

1. Sign in at `/admin/login` and confirm the connection indicator is Online.
2. Review Dashboard warehouse scope, pending transfers, pending representative receiving, and cash submissions.
3. Use Reports to compare warehouse stock, representative stock, customer credit, and cash hold before processing exceptions.

## Master data

- Create/deactivate warehouses, products, vehicles, customers, representatives, and users only within your assigned permissions and warehouses.
- Credit permission and limit are separate controls. Confirm the approved amount before saving.
- Deactivate records with history; never attempt to delete posted transaction data.

## Stock operations

- Stock Import: save a draft, compare warehouse/product/quantity to source paperwork, then post once. Drafts do not affect stock.
- Adjustment: select increase/decrease, enter a specific reason, review current stock, then post. Use only for a documented physical discrepancy.
- Warehouse/representative transfer: review immutable lines before dispatch. Source stock moves to in-transit custody; destination/representative receipt completes it.
- Correct a posted operation only with the authorized void/reversal action and a meaningful reason.

## Sales, credit, and cash

- Sales register is read-only except for explicitly authorized voids. Confirm that a reversal is operationally safe before proceeding.
- Customer payment begins as a draft; verify customer, amount, date, method, and reference before posting. Overpayment is rejected.
- Representative cash submission reduces cash hold only after office confirmation. Compare physical handover evidence before confirming.

## Reports and incidents

- Financial summaries include Posted records only; registers may also show Draft/Voided states.
- Capture `X-Request-ID`, time, user, route, reference, and visible error when reporting a fault. Never send passwords, cookies, or full sensitive payloads.
- When Offline, transaction actions are disabled. Do not create parallel paper transactions for later re-entry unless the incident owner activates the documented continuity process.
