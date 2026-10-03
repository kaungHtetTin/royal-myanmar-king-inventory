# Sales Representative App API

**Production site:** `https://www.superkingmyanmar.com/public`  
**API base URL:** `https://www.superkingmyanmar.com/public/api`  
**CSRF URL:** `https://www.superkingmyanmar.com/public/sanctum/csrf-cookie`  
**Document version:** 1.0  
**Last verified:** 2026-09-24  
**Scope:** Every HTTP endpoint required or available to the sales-representative application. Administrator endpoints are intentionally excluded.

## 1. Production verification and source of truth

This reference was generated from the Laravel route table, controllers, request validation, resources, policies, services, enums, and automated tests in this repository. The production server was also checked without representative credentials.

Verified against production on 2026-09-24:

- `GET /api/health` returned `200` and `status: "ok"`.
- `GET /api/branding` returned `200` with the Royal Myanmar King Company Limited branding payload.
- `GET /sanctum/csrf-cookie` returned `204` and issued `XSRF-TOKEN` and session cookies.
- All 31 protected `/api/sales/*` method/path pairs returned JSON `401` without a session, confirming that the documented production routes are deployed and protected.
- An empty `POST /api/auth/login` returned the documented `422` validation payload.

Authenticated production examples cannot be verified without a representative account. For those endpoints, the checked-in server code is the authoritative contract.

## 2. Protocol conventions

### 2.1 Content, dates, money, and quantities

- Send `Accept: application/json` on every request.
- Send `Content-Type: application/json` on requests with a JSON body.
- Timestamps are ISO 8601 strings, normally UTC with a `Z` suffix.
- Date-only filters use `YYYY-MM-DD`.
- All money values are integers in the smallest configured currency unit. Production currency is `MMK`; do not send decimals for amounts.
- Product `quantity` is expressed in the selected unit. `base_quantity` is the server-calculated quantity in the product base unit.
- FOC means free-of-charge stock. FOC stock is accounted for separately from paid stock.
- IDs are positive integers.
- Nullable values are returned as JSON `null`.

### 2.2 Authentication: Sanctum cookie session

The current login endpoint does **not** issue a Bearer token. The supported contract is a Laravel Sanctum cookie/session flow.

1. Create a persistent cookie jar.
2. `GET /sanctum/csrf-cookie` and retain both returned cookies.
3. URL-decode the `XSRF-TOKEN` cookie value.
4. Send it as `X-XSRF-TOKEN` on state-changing requests and continue sending the session cookie.
5. `POST /api/auth/login` with `portal: "sales"`.
6. Confirm the session with `GET /api/sales/me`.

For an Android client, use an HTTP cookie jar. Do not store the session cookie in plain preferences. The web app uses `withCredentials: true`; a native app must provide equivalent cookie persistence. Native HTTP clients are not restricted by browser CORS, but the cookies are `Secure` and must only be used over HTTPS.

Example browser-style login with curl:

```bash
BASE="https://www.superkingmyanmar.com/public"

curl -c cookies.txt -b cookies.txt \
  -H "Accept: application/json" \
  "$BASE/sanctum/csrf-cookie"

# Read and URL-decode XSRF-TOKEN from cookies.txt before setting this value.
XSRF_TOKEN="decoded-XSRF-TOKEN-cookie-value"

curl -c cookies.txt -b cookies.txt \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "X-XSRF-TOKEN: $XSRF_TOKEN" \
  -d '{"login":"representative.username","password":"secret","portal":"sales","remember":false}' \
  "$BASE/api/auth/login"
```

There is currently no password reset, refresh-token, personal-access-token, or device-registration endpoint in the sales API.

### 2.3 Authorization

Every `/api/sales/*` route requires:

- an authenticated, active user;
- the `sales-representative` role;
- an active representative profile linked to that user; and
- the endpoint permission shown below, where applicable.

The server always scopes sales, stock, cash, customers, trips, and receivings to the authenticated representative. Never accept a representative ID from local state as proof of ownership.

### 2.4 Idempotency

The following commands require an `Idempotency-Key` header with a non-empty string of at most 100 characters:

- create sale;
- post sale;
- receive representative stock;
- collect customer credit;
- create cash submission;
- cancel cash submission.

Generate one UUID per user action. Reuse the same key only when retrying that exact command after an uncertain network result. A completed retry returns the original result. Concurrent reuse may return `409 COMMAND_IN_PROGRESS`.

### 2.5 Pagination

Paginated endpoints return:

```json
{
  "data": [],
  "meta": {
    "current_page": 1,
    "from": 1,
    "last_page": 3,
    "per_page": 20,
    "to": 20,
    "total": 53
  }
}
```

`from` and `to` can be `null` for an empty page. Laravel resource collections may include navigation `links` in addition to the fields shown above. Endpoint-specific `summary` objects are documented below.

### 2.6 Rate limit and tracing

- API limit: 120 requests per minute per authenticated user, or per IP before authentication.
- Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-Request-ID`.
- A `429` response may include `Retry-After`; back off and retry only after that delay.
- Clients may send `X-Request-ID`; log the response request ID for support diagnostics.

### 2.7 Standard errors

| Status | Meaning | Typical body |
| ---: | --- | --- |
| `401` | No valid session | `{"message":"Unauthenticated."}` |
| `403` | Inactive account/profile, wrong role, missing permission, or foreign-owned record | `{"message":"...","code":"..."}` or Laravel authorization message |
| `404` | Record not found or deliberately hidden because it is out of scope | `{"message":"Not Found"}` |
| `409` | Valid request conflicts with document or business state | `{"message":"...","code":"...","details":null}` |
| `419` | CSRF/session mismatch in a stateful cookie request | refresh CSRF/session and sign in again if needed |
| `422` | Validation failed | `{"message":"...","errors":{"field":["..."]}}` |
| `429` | Rate limit exceeded | Laravel throttle response; honor `Retry-After` |
| `500` | Unexpected server failure | Treat as an uncertain result for idempotent commands and retry with the same key |

Business conflicts used by the sales app include:

| Code | Meaning |
| --- | --- |
| `ACCOUNT_INACTIVE` | User account is inactive; the session is invalidated. |
| `REPRESENTATIVE_PROFILE_UNAVAILABLE` | Representative profile is missing or inactive. |
| `PORTAL_ACCESS_DENIED` | Account cannot use the requested portal. |
| `NO_OPERATING_TRIP` | A sale/collection requires a trip in `operation`. |
| `NO_ACTIVE_TRIP` | A cash submission requires a trip in `operation` or `ending`. |
| `INVALID_TRIP_STATE` | Trip is not in the required state. |
| `TRIP_HAS_DRAFT_SALES` | Post or delete all drafts before beginning trip ending. |
| `INVALID_DOCUMENT_STATE` | Command is not allowed for the current document status. |
| `INVALID_DOCUMENT_DIRECTION` | Command is not valid for this transfer direction. |
| `INSUFFICIENT_REPRESENTATIVE_STOCK` | Paid stock is too low; details can include product, available, and requested quantities. |
| `INSUFFICIENT_REPRESENTATIVE_FOC_STOCK` | FOC stock is too low. |
| `INSUFFICIENT_REPRESENTATIVE_CASH` | Cash hold/available handover amount is too low. |
| `INSUFFICIENT_CUSTOMER_CREDIT` | Customer has insufficient credit or a posted credit sale can no longer be reversed safely. |
| `NO_CUSTOMER_CREDIT` | Customer has no collectible outstanding credit. |
| `CUSTOMER_CREDIT_DISABLED` | Credit sales are disabled for this customer. |
| `CUSTOMER_CREDIT_LIMIT_EXCEEDED` | The sale would exceed the customer's configured credit limit; details include the current and projected amounts. |
| `INACTIVE_MASTER_DATA` | A warehouse, region, representative, customer, product, or unit is inactive/out of scope. |
| `INVALID_CUSTOMER_SCOPE` | A customer payment no longer matches the customer's warehouse. |
| `INVALID_REPRESENTATIVE` | The linked representative is not active/valid for the cash command. |
| `INSUFFICIENT_IN_TRANSIT_STOCK` | A receiving no longer has the required quantity in transit. |
| `EMPTY_SALE` | Sale has no line items. |
| `EMPTY_TRANSFER` | Transfer has no line items. |
| `SALE_TOTAL_MISMATCH` | Stored sale totals failed the server reconciliation check. |
| `COMMAND_IN_PROGRESS` | The same idempotency key is already processing. |

## 3. Complete endpoint index

There are 38 relevant operations: one CSRF helper, three public support endpoints, three shared session endpoints, and 31 representative endpoints.

| # | Method | Path | Permission | Purpose |
| ---: | --- | --- | --- | --- |
| 1 | GET | `/sanctum/csrf-cookie` | Public | Initialize CSRF and session cookies |
| 2 | GET | `/api/health` | Public | Service readiness |
| 3 | GET | `/api/branding` | Public | App branding and currency |
| 4 | GET | `/api/branding/assets/{asset}` | Public | Logo or favicon binary |
| 5 | POST | `/api/auth/login` | Public | Start a session |
| 6 | GET | `/api/auth/user` | Authenticated active user | Restore a session |
| 7 | POST | `/api/auth/logout` | Authenticated active user | End a session |
| 8 | GET | `/api/sales/me` | Sales role + active profile | Sales-app session identity |
| 9 | GET | `/api/sales/profile` | Sales role + active profile | Representative profile |
| 10 | PUT | `/api/sales/profile` | Sales role + active profile | Update profile/account |
| 11 | PUT | `/api/sales/profile/password` | Sales role + active profile | Change password |
| 12 | GET | `/api/sales/representatives/{salesRepresentative}` | Own profile only | Profile by ID |
| 13 | GET | `/api/sales/dashboard` | `dashboard.view` or `report.view` | Home dashboard |
| 14 | GET | `/api/sales/stock` | `representative_stock.view` | Own stock |
| 15 | GET | `/api/sales/receivings` | `representative_stock.receive` | Pending stock issues |
| 16 | GET | `/api/sales/receiving-history` | `representative_stock.receive` | Received/reversed history |
| 17 | GET | `/api/sales/receivings/{representativeTransfer}` | `representative_stock.receive` | Receiving detail |
| 18 | POST | `/api/sales/receivings/{representativeTransfer}/receive` | `representative_stock.receive` | Receive full issue |
| 19 | GET | `/api/sales/customer-options` | `sale.create` | Regions and payment methods |
| 20 | GET | `/api/sales/customers` | `sale.create` | Search assigned customers |
| 21 | POST | `/api/sales/customers` | `sale.create` | Create customer |
| 22 | GET | `/api/sales/sale-options` | `sale.create` | Current-trip sale form data |
| 23 | GET | `/api/sales/sale-history-options` | `sale.view` | Sale-history filter options |
| 24 | GET | `/api/sales/sales` | `sale.view` | Own sale history |
| 25 | GET | `/api/sales/sales/{sale}` | `sale.view` | Own sale detail |
| 26 | POST | `/api/sales/sales` | `sale.create` | Create draft sale |
| 27 | PUT | `/api/sales/sales/{sale}` | `sale.create` | Update current-trip draft |
| 28 | DELETE | `/api/sales/sales/{sale}` | `sale.create` | Delete draft |
| 29 | POST | `/api/sales/sales/{sale}/post` | `sale.create` | Post draft sale |
| 30 | POST | `/api/sales/credit-collections` | `sale.create` | Collect outstanding credit |
| 31 | GET | `/api/sales/current-trip` | `trip.view` | Current trip and reconciliation |
| 32 | POST | `/api/sales/trips/{trip}/expenses` | `trip_expense.create` | Record trip expense |
| 33 | POST | `/api/sales/trips/{trip}/begin-ending` | `trip.view` | Move operation to ending |
| 34 | GET | `/api/sales/cash-hold` | `cash.view` | Cash custody overview |
| 35 | GET | `/api/sales/cash-submissions` | `cash.view` | Own cash submissions |
| 36 | GET | `/api/sales/cash-transactions` | `cash.view` | Own cash ledger |
| 37 | POST | `/api/sales/cash-submissions` | `cash.submit` | Create handover request |
| 38 | POST | `/api/sales/cash-submissions/{cashSubmission}/cancel` | `cash.submit` | Cancel pending handover |

## 4. Public support and session endpoints

### 4.1 Initialize CSRF cookies

`GET /sanctum/csrf-cookie`

- Auth: public.
- Request body: none.
- Success: `204 No Content`.
- Side effect: sets `XSRF-TOKEN` and the HTTP-only session cookie.

### 4.2 Health

`GET /api/health`

- Auth: public.
- Success: `200`; may return `503` when database or cache is unavailable.

```json
{
  "status": "ok",
  "service": "Stock & Inventory Management",
  "version": null,
  "deployment_id": null,
  "checks": { "database": true, "cache": true },
  "checked_at": "2026-09-24T04:07:54.300826Z"
}
```

### 4.3 Branding

`GET /api/branding`

- Auth: public.
- Success: `200`.

| Field | Type |
| --- | --- |
| `business_name`, `business_tagline` | string or null |
| `primary_color` | `#RRGGBB` string |
| `logo_url`, `favicon_url` | absolute URL or null |
| `business_email`, `business_phone`, `business_address` | string or null |
| `currency_code` | 3-character string; production is `MMK` |
| `invoice_footer` | string or null |

`GET /api/branding/assets/{asset}`

- `asset`: exactly `logo` or `favicon`.
- Success: `200` binary response with `Cache-Control: public, max-age=3600`.
- Errors: `404` for an unsupported or unconfigured asset.

### 4.4 Login

`POST /api/auth/login`

Request:

| Field | Rules |
| --- | --- |
| `login` | required string, max 255; username or email |
| `password` | required string, 6-255 characters |
| `portal` | required; use exactly `sales` |
| `remember` | optional boolean |

```json
{
  "login": "sale.rep",
  "password": "secret-password",
  "portal": "sales",
  "remember": false
}
```

Success `200`:

```json
{
  "user": {
    "id": 17,
    "name": "Aye Aye",
    "username": "sale.rep",
    "email": "rep@example.com",
    "is_active": true,
    "last_login_at": "2026-09-24T04:20:00.000000Z",
    "roles": ["sales-representative"],
    "permissions": ["dashboard.view", "sale.view", "sale.create"],
    "warehouses": [{ "id": 1, "code": "WH-01", "name": "Main Warehouse" }],
    "representative_id": 9
  }
}
```

Special errors:

- invalid credentials: `422`, error key `login`;
- five failed attempts: `422`, error key `login`, with retry seconds in the message;
- inactive account: `403 ACCOUNT_INACTIVE`;
- missing/inactive representative: `403 REPRESENTATIVE_PROFILE_UNAVAILABLE`;
- wrong portal/role: `403 PORTAL_ACCESS_DENIED`.

### 4.5 Restore identity

`GET /api/auth/user`  
`GET /api/sales/me`

Both return the login `user` payload. `/api/sales/me` additionally enforces the sales role and active representative profile and is the preferred post-login check for the sales app.

### 4.6 Logout

`POST /api/auth/logout`

- Request body: empty object or no body.
- Success `200`: `{"message":"Logged out."}`.
- The server invalidates the session and rotates the CSRF token. Delete the client cookie jar.

## 5. Profile endpoints

### 5.1 Get profile

`GET /api/sales/profile`

Success `200`:

```json
{
  "representative": {
    "id": 9,
    "code": "REP-0009",
    "name": "Aye Aye",
    "phone": "09123456789",
    "email": "rep@example.com",
    "region": "Legacy region label",
    "regions": [{ "id": 3, "name": "Yangon East" }],
    "is_active": true,
    "primary_warehouse": { "id": 1, "code": "WH-01", "name": "Main Warehouse" },
    "account": { "id": 17, "name": "Aye Aye", "username": "sale.rep", "email": "rep@example.com" }
  }
}
```

### 5.2 Get profile by ID

`GET /api/sales/representatives/{salesRepresentative}`

- Path ID must identify the authenticated representative.
- Success: same `representative` payload as `GET /api/sales/profile`.
- Foreign representative: `403`.

### 5.3 Update profile

`PUT /api/sales/profile`

| Field | Rules |
| --- | --- |
| `name` | required string, max 255 |
| `username` | required string, max 100, unique; only letters, digits, `.`, `_`, `-` |
| `email` | nullable valid email, max 255, unique |
| `phone` | nullable string, max 50 |

All fields above should be sent. Success `200` returns both updated `representative` and `user` objects.

### 5.4 Change password

`PUT /api/sales/profile/password`

| Field | Rules |
| --- | --- |
| `current_password` | required string, minimum 6 |
| `password` | required string, minimum 6 |
| `password_confirmation` | required to match `password` |

Success `200`: `{"message":"Password updated."}`. An incorrect current password returns `422` under `errors.current_password`.

## 6. Dashboard

`GET /api/sales/dashboard`

- Permission: `dashboard.view` **or** `report.view`.
- Request body/query: none.
- Success `200`:

```json
{
  "as_of": "2026-09-24T04:30:00.000000Z",
  "representative": { "id": 9, "code": "REP-0009", "name": "Aye Aye" },
  "kpis": {
    "stock_units": 120,
    "stock_products": 8,
    "pending_receivings": 1,
    "today_sales": 250000,
    "today_cash_sales": 200000,
    "today_credit_sales": 50000,
    "cash_hold": 200000
  },
  "stock": [],
  "pending_receivings": [],
  "recent_sales": []
}
```

`stock` contains at most six highest-quantity records. `pending_receivings` contains at most five dispatched issues. `recent_sales` contains at most five sales of any status. Their row schemas are the same compact identities documented in the response models section.

## 7. Stock and receiving endpoints

### 7.1 Own stock

`GET /api/sales/stock`

Permission: `representative_stock.view`.

Query:

| Parameter | Rules | Default |
| --- | --- | ---: |
| `page` | positive integer (Laravel paginator) | 1 |
| `per_page` | integer 10-100 | 10 |
| `search` | string, max 100; product name or SKU | none |

Response: paginated `RepresentativeInventory` rows plus:

```json
{
  "summary": {
    "on_hand": 120,
    "foc_on_hand": 8,
    "incoming": 25
  }
}
```

The summary covers all of the representative's stock, not only the current search/page.

### 7.2 Pending receivings

`GET /api/sales/receivings`

- Permission: `representative_stock.receive`.
- Query: `page`; `per_page` integer 10-100, default 10.
- Returns only own `direction: "issue"`, `status: "dispatched"` transfers, oldest dispatch first.
- Response: paginated `RepresentativeTransfer` resources.

### 7.3 Receiving history

`GET /api/sales/receiving-history`

- Permission: `representative_stock.receive`.
- Query: `page`; `per_page` integer 10-100, default 10.
- Returns own issue transfers with status `received` or `reversed`, latest update first.
- Response: paginated `RepresentativeTransfer` resources.

### 7.4 Receiving detail

`GET /api/sales/receivings/{representativeTransfer}`

- Permission: `representative_stock.receive`.
- Must be an own transfer with `direction: "issue"`.
- Success: `200 {"data": RepresentativeTransfer}`.
- Foreign transfer: `403`; non-issue transfer: `404`.

### 7.5 Receive an issue

`POST /api/sales/receivings/{representativeTransfer}/receive`

- Permission: `representative_stock.receive`.
- Required header: `Idempotency-Key`.
- Body: empty object.
- Receives the **entire** dispatched issue; partial receipt/rejection is not supported.
- Success: `200 {"data": RepresentativeTransfer}` with status `received`.
- Repeating the same key is safe. A different key after receipt returns a state conflict.

## 8. Customer endpoints

### 8.1 Customer form options

`GET /api/sales/customer-options`

- Permission: `sale.create`.
- Returns all active regions assigned to the representative and currently active payment methods.

```json
{
  "regions": [
    {
      "id": 3,
      "name": "Yangon East",
      "warehouse_id": 1,
      "warehouse": { "id": 1, "code": "WH-01", "name": "Main Warehouse" }
    }
  ],
  "payment_methods": [
    { "key": "cash", "name": "Cash", "adds_to_cash_hold": true, "is_active": true }
  ]
}
```

Payment methods are configurable; do not hard-code the list. Use the returned `key` in later requests.

### 8.2 List/search customers

`GET /api/sales/customers`

- Permission: `sale.create`.
- Query: `page` positive integer; `search` string max 100.
- Fixed page size: 20.
- Search matches code, name, phone, or township.
- Results include only customers in the representative's active assigned regions.

Each customer contains `id`, `code`, `name`, `customer_type`, `phone`, `region_id`, `township`, `address`, `notes`, `is_active`, `credit_allowed`, `credit_limit`, `created_at`, `outstanding_amount`, `available_credit`, and a nullable region/warehouse object.

### 8.3 Create customer

`POST /api/sales/customers`

Permission: `sale.create`.

| Field | Rules |
| --- | --- |
| `name` | required string, max 255 |
| `customer_type` | nullable string, max 100 |
| `phone` | nullable string, max 50 |
| `region_id` | required existing integer; must be an active region assigned to this representative |
| `township` | nullable string, max 100 |
| `address` | nullable string, max 500 |
| `notes` | nullable string, max 1000 |

Success `201`:

```json
{
  "customer": {
    "id": 44,
    "code": "CUS-000044",
    "name": "New Shop",
    "credit_allowed": false,
    "credit_limit": 0,
    "outstanding_amount": 0,
    "available_credit": 0
  }
}
```

Sales-created customers are active but start with credit disabled and a zero credit limit.

## 9. Sale endpoints

### 9.1 Sale form options

`GET /api/sales/sale-options`

- Permission: `sale.create`.
- Requires an own trip in `operation`; otherwise `409 NO_OPERATING_TRIP`.
- Returns:
  - current trip, region, and warehouse;
  - current representative and assigned regions;
  - active customers in the trip region with credit balances;
  - active products currently held by the representative;
  - active units and region-specific prices;
  - configured payment methods;
  - current cash hold.

Product option example:

```json
{
  "id": 7,
  "sku": "SKU-007",
  "name": "Product",
  "unit": "piece",
  "quantity": 30,
  "foc_quantity": 3,
  "units": [
    {
      "id": 11,
      "name": "carton",
      "conversion_factor": 12,
      "is_base": false,
      "is_default_selling": true,
      "prices": [{ "region_id": 3, "price": 12000 }]
    }
  ],
  "selling_price": 12000
}
```

The server price is authoritative. Refresh options before a mutation after reconnecting.

### 9.2 Sale-history filter options

`GET /api/sales/sale-history-options`

Permission: `sale.view`.

Query:

| Parameter | Rules |
| --- | --- |
| `period` | `today` or `range` |
| `date_from` | valid date |
| `date_to` | valid date, on/after `date_from` |

Returns `customers`, `products`, and `trips` that have appeared in the representative's sales. When a period/range is supplied, the trip options are restricted to trips with sales in that duration.

### 9.3 List own sales

`GET /api/sales/sales`

Permission: `sale.view`.

| Parameter | Rules |
| --- | --- |
| `page` | positive integer (paginator) |
| `per_page` | integer 10-100; default 20 |
| `customer_id` | existing customer ID |
| `product_id` | existing product ID |
| `trip_id` | existing trip ID |
| `status` | `draft`, `posted`, or `voided` |
| `payment_type` | `cash` or `credit` |
| `period` | `today` or `range` |
| `date_from` | valid date |
| `date_to` | valid date on/after `date_from` |
| `search` | max 100; reference, customer name, or customer code |

Date filtering uses `posted_at` when present, otherwise `created_at`.

Response: paginated full `Sale` resources plus a summary calculated over all matching **posted** sales:

```json
{
  "summary": {
    "gross_sales": 250000,
    "cash_sales": 200000,
    "credit_sales": 50000,
    "units_sold": 42
  }
}
```

`units_sold` is the sum of paid `base_quantity`; FOC quantity is excluded.

### 9.4 Get sale

`GET /api/sales/sales/{sale}`

- Permission: `sale.view`.
- Own sales only; foreign sale returns `403`.
- Success: `200 {"data": Sale}`.

### 9.5 Create draft sale

`POST /api/sales/sales`

- Permission: `sale.create`.
- Required header: `Idempotency-Key`.
- Requires an own trip in `operation`.
- Success: `201 {"data": Sale}` with status `draft`.

Request rules:

| Field | Rules |
| --- | --- |
| `customer_id` | required existing integer; active and in current trip region |
| `payment_type` | required `cash` or `credit` |
| `payment_method` | active key from options; for cash, omission selects the server's configured default; ignored/set null for credit |
| `notes` | nullable string, max 2000 |
| `cashback_amount` | nullable integer, 0-999999999999999 |
| `promotion_title` | nullable string, max 150 |
| `promotion_amount` | nullable integer; must be `0` for new sales (legacy invoice promotion field) |
| `creation_latitude` | required numeric, -90 through 90 |
| `creation_longitude` | required numeric, -180 through 180 |
| `location_accuracy_meters` | nullable numeric, 0-1000000 |
| `items` | required array, 1-100 distinct products |
| `items.*.product_id` | required existing, active, distinct product ID |
| `items.*.product_unit_id` | nullable existing unit ID of the same product; defaults to default selling unit |
| `items.*.quantity` | required integer, 1-4294967295 |
| `items.*.discount_percentage` | nullable number, 0-100, at most 2 decimals |
| `items.*.promotion_title` | nullable string, max 150 |
| `items.*.promotion_amount` | nullable integer, 0-999999999999999 |
| `items.*.foc_product_unit_id` | nullable existing active unit ID of the same product |
| `items.*.foc_quantity` | nullable integer, 0-4294967295 |

Example:

```json
{
  "customer_id": 44,
  "payment_type": "cash",
  "payment_method": "cash",
  "notes": "Delivered to shop",
  "cashback_amount": 100,
  "promotion_amount": 0,
  "creation_latitude": 16.8409,
  "creation_longitude": 96.1735,
  "location_accuracy_meters": 12,
  "items": [
    {
      "product_id": 7,
      "product_unit_id": 11,
      "quantity": 2,
      "discount_percentage": 10,
      "promotion_title": "Launch offer",
      "promotion_amount": 50,
      "foc_product_unit_id": 10,
      "foc_quantity": 1
    }
  ]
}
```

Server calculations:

```text
gross_total = unit_price * quantity
discount_amount = round(gross_total * discount_percentage / 100)
line_total = gross_total - discount_amount - item promotion_amount
total_amount = sum(line_total) - cashback_amount - invoice promotion_amount
base_quantity = quantity * selected unit conversion_factor
foc_base_quantity = foc_quantity * FOC unit conversion_factor
```

The item discount plus item promotion cannot exceed the item gross total. Cashback plus invoice-level promotion cannot exceed the discounted merchandise subtotal. Client totals are previews only; use returned totals.

### 9.6 Update draft sale

`PUT /api/sales/sales/{sale}`

- Permission: `sale.create`.
- Own sale only, same current operating trip, status `draft`.
- Uses the same request rules as create, except `creation_latitude`, `creation_longitude`, and `location_accuracy_meters` are prohibited.
- No idempotency header is required.
- Existing legacy invoice `promotion_title`/`promotion_amount` may be omitted and will be preserved. If supplied, they must be unchanged; new invoice-level promotions cannot be added. Item-level promotions remain editable.
- Success: `200 {"data": Sale}`.

### 9.7 Delete draft sale

`DELETE /api/sales/sales/{sale}`

- Permission: `sale.create`.
- Own draft only.
- Success: `204 No Content`.
- Posted/voided: `409 INVALID_DOCUMENT_STATE`.

### 9.8 Post sale

`POST /api/sales/sales/{sale}/post`

- Permission: `sale.create`.
- Required header: `Idempotency-Key`.
- Body: empty object.
- Own draft only; trip must still be in `operation`.
- Atomically verifies active master data, totals, credit, paid stock, and FOC stock; then updates inventory and the appropriate cash/credit ledger.
- Cash payment methods with `adds_to_cash_hold: true` increase representative cash hold. Non-cash-hold methods such as banking do not.
- Success: `200 {"data": Sale}` with status `posted`.

Posted sales are immutable in the sales app. Voiding is an office/admin action and is outside this API.

## 10. Credit collection

`POST /api/sales/credit-collections`

- Permission: `sale.create`.
- Required header: `Idempotency-Key`.
- Requires an own trip in `operation`.

| Field | Rules |
| --- | --- |
| `customer_id` | required existing integer; active and in current trip region |
| `amount` | required integer, 1-999999999999999 |
| `payment_method` | optional active method key; defaults to the configured cash-hold method |
| `notes` | nullable string, max 1000 |

The customer must allow credit and have a positive outstanding amount. The posting service also prevents collection beyond the available outstanding balance.

Success `201`:

```json
{
  "data": {
    "id": 31,
    "reference": "PAY-000031",
    "trip": { "id": 12, "reference": "TRP-000012", "title": "East Route" },
    "representative": { "id": 9, "code": "REP-0009", "name": "Aye Aye" },
    "warehouse": { "id": 1, "code": "WH-01", "name": "Main Warehouse" },
    "customer": { "id": 44, "code": "CUS-000044", "name": "New Shop" },
    "amount": 40000,
    "payment_date": "2026-09-24",
    "payment_method": "cash",
    "payment_method_name": "Cash",
    "adds_to_cash_hold": true,
    "payment_reference": null,
    "notes": "Partial payment",
    "status": "posted",
    "received_by": { "id": 17, "name": "Aye Aye" },
    "created_by": { "id": 17, "name": "Aye Aye" },
    "posted_by": { "id": 17, "name": "Aye Aye" },
    "posted_at": "2026-09-24T04:40:00.000000Z",
    "voided_by": null,
    "voided_at": null,
    "void_reason": null,
    "created_at": "2026-09-24T04:40:00.000000Z"
  },
  "outstanding_amount": 60000
}
```

## 11. Trip endpoints

Trip states are `planning`, `operation`, `ending`, `completed`, and `cancelled`. The sales app can read the current planning/operation/ending trip, add expenses during operation, and begin ending. Starting, completing, and cancelling trips are office actions.

### 11.1 Current trip

`GET /api/sales/current-trip`

- Permission: `trip.view`.
- No current trip: `200 {"data":null}`.
- Current trip: `200 {"data": Trip}`.

The detailed trip includes:

- trip identity, status, warehouse, region, representative, vehicle, notes, lifecycle actors/timestamps;
- `stock_issues` and `stock_returns` as `RepresentativeTransfer[]`;
- `sales` as `Sale[]`;
- `expenses`;
- `cash_submissions`;
- `customer_payments`;
- base-unit `product_summary` (`issued`, `issued_foc`, `sold`, `sold_foc`, `returned`, `returned_foc`, `remaining`, `remaining_foc`);
- `financial_summary` (cash/credit sales, credit collected, payment-method totals, expenses, handovers, and current hold);
- `current_stock_units`.

This can be a large payload. Do not poll it continuously; refresh on screen entry and after relevant mutations.

### 11.2 Record expense

`POST /api/sales/trips/{trip}/expenses`

- Permission: `trip_expense.create`.
- Trip must belong to the representative and be in `operation`.

| Field | Rules |
| --- | --- |
| `description` | required string, max 200 |
| `amount` | required integer, 1-999999999999999 |
| `spent_at` | nullable valid date/time; defaults to server current time |
| `notes` | nullable string, max 2000 |

Success `201`:

```json
{
  "expense": {
    "id": 8,
    "description": "Parking",
    "amount": 500,
    "spent_at": "2026-09-24T04:45:00.000000Z",
    "notes": "Market parking"
  }
}
```

### 11.3 Begin trip ending

`POST /api/sales/trips/{trip}/begin-ending`

- Permission: `trip.view`.
- Body: empty object.
- Own trip only; current status must be `operation`.
- All draft sales must first be posted or deleted.
- Success: `200 {"data": Trip}` with status `ending`.
- Draft sales: `409 TRIP_HAS_DRAFT_SALES`.

## 12. Cash endpoints

### 12.1 Cash overview

`GET /api/sales/cash-hold`

Permission: `cash.view`.

```json
{
  "representative": { "id": 9, "code": "REP-0009", "name": "Aye Aye" },
  "cash_hold": 500000,
  "pending_submissions": 400000,
  "available_to_submit": 100000
}
```

A pending submission reserves availability but does not reduce `cash_hold`; office confirmation reduces the hold.

### 12.2 List cash submissions

`GET /api/sales/cash-submissions`

- Permission: `cash.view`.
- Query: `page`; `per_page` integer 10-100, default 20; optional existing `trip_id`.
- Returns only the authenticated representative's submissions, newest first.
- Response: paginated `CashSubmission` resources.

### 12.3 Cash transaction ledger

`GET /api/sales/cash-transactions`

- Permission: `cash.view`.
- Query: `page`; `per_page` integer 10-100, default 10.
- Returns own ledger rows newest first.

Ledger row:

```json
{
  "id": 72,
  "type": "cash_sale",
  "amount_delta": 25000,
  "reference": "SAL-000072",
  "notes": null,
  "actor": { "id": 17, "name": "Aye Aye" },
  "occurred_at": "2026-09-24T04:50:00.000000Z"
}
```

Possible types visible to a representative include `cash_sale`, `cash_sale_void`, `cash_submission_confirmed`, `cash_submission_reversed`, and `customer_payment`/`customer_payment_void` when the payment method adds to cash hold.

### 12.4 Create cash submission

`POST /api/sales/cash-submissions`

- Permission: `cash.submit`.
- Required header: `Idempotency-Key`.
- Requires an own trip in `operation` or `ending`.

| Field | Rules |
| --- | --- |
| `amount` | required integer, 1-999999999999999; cannot exceed `available_to_submit` |
| `notes` | nullable string, max 2000 |

Success: `201 {"data": CashSubmission}` with status `pending`.

### 12.5 Cancel pending cash submission

`POST /api/sales/cash-submissions/{cashSubmission}/cancel`

- Permission: `cash.submit`.
- Required header: `Idempotency-Key`.
- Own pending submission only.

| Field | Rules |
| --- | --- |
| `reason` | required string, max 500; trimmed by server |

Success: `200 {"data": CashSubmission}` with status `cancelled`.

## 13. Response resource schemas

### 13.1 Sale

| Field | Type / notes |
| --- | --- |
| `id` | integer |
| `reference` | string |
| `trip` | `{id, reference, title}` or null |
| `representative` | `{id, code, name, phone}` |
| `warehouse` | `{id, code, name, address, phone}` |
| `region` | `{id, name}` or null |
| `customer` | `{id, code, name, address, phone}` |
| `payment_type` | `cash` or `credit` |
| `payment_method`, `payment_method_name` | string or null |
| `adds_to_cash_hold` | boolean |
| `total_amount` | integer net total |
| `cashback_amount`, `promotion_amount`, `merchandise_subtotal` | integer |
| `promotion_title` | string or null |
| `status` | `draft`, `posted`, or `voided` |
| `notes` | string or null |
| `creation_location` | `{latitude, longitude, accuracy_meters, captured_at}` or null |
| `items` | `SaleItem[]` |
| `total_quantity`, `total_foc_quantity` | integer selected-unit quantities |
| `total_discount`, `total_cashback`, `total_item_promotion`, `gross_amount` | integer |
| `created_by`, `posted_by`, `voided_by` | `{id, name}` or null |
| `posted_at`, `voided_at`, `created_at` | ISO timestamp or null |
| `void_reason` | string or null |

`SaleItem` contains `id`, product identity and units, selected `unit`, `quantity`, `base_quantity`, `unit_price`, `gross_total`, `discount_percentage`, `discount_amount`, `promotion_title`, `promotion_amount`, `line_total`, `foc_unit`, `foc_quantity`, and `foc_base_quantity`.

### 13.2 RepresentativeInventory

```json
{
  "id": 5,
  "representative": { "id": 9, "code": "REP-0009", "name": "Aye Aye" },
  "product": {
    "id": 7,
    "sku": "SKU-007",
    "name": "Product",
    "unit": "piece",
    "base_unit": "piece",
    "units": [
      { "id": 10, "name": "piece", "conversion_factor": 1, "is_base": true, "is_default_selling": false }
    ]
  },
  "quantity": 30,
  "foc_quantity": 3,
  "pending_quantity": 25,
  "updated_at": "2026-09-24T04:55:00.000000Z"
}
```

### 13.3 RepresentativeTransfer

| Field | Type / notes |
| --- | --- |
| `id`, `reference` | integer, string |
| `trip` | `{id, reference, title}` or null |
| `direction` | `issue` or `return` |
| `source_warehouse` | `{id, code, name}` |
| `representative` | `{id, code, name}` |
| `status` | `draft`, `dispatched`, `received`, `cancelled`, `reversed` |
| `notes` | string or null |
| `items` | transfer line array |
| `total_quantity`, `total_base_quantity`, `total_foc_base_quantity` | integer |
| lifecycle actor fields | `{id, name}` or null |
| lifecycle timestamp fields | ISO timestamp or null |
| `cancel_reason`, `reversal_reason` | string or null |

Each item contains product identity, selected unit, quantity, base quantity, FOC unit/quantities, and `in_transit_quantity`.

### 13.4 CashSubmission

| Field | Type / notes |
| --- | --- |
| `id`, `reference` | integer, string |
| `trip` | `{id, reference, title}` or null |
| `representative` | `{id, code, name}` |
| `warehouse` | `{id, code, name}` |
| `amount` | integer |
| `status` | `pending`, `confirmed`, `cancelled`, `reversed` |
| `notes` | string or null |
| `created_by`, `confirmed_by`, `cancelled_by`, `reversed_by` | `{id, name}` or null |
| `confirmed_at`, `cancelled_at`, `reversed_at`, `created_at` | ISO timestamp or null |
| `cancel_reason`, `reversal_reason` | string or null |

### 13.5 Trip

The root Trip fields are:

`id`, `reference`, `title`, `status`, `warehouse`, `region`, `representative`, `vehicle`, `notes`, `opening_cash_balance`, `stock_variance_units`, `cash_variance_amount`, `completion_notes`, `created_by`, `started_by`, `ending_by`, `completed_by`, `cancelled_by`, `created_at`, `started_at`, `ending_at`, `completed_at`, `cancelled_at`, and `cancel_reason`.

When returned by the sales current-trip endpoint, it also contains the nested reconciliation collections and summaries described in section 11.1.

## 14. Recommended app workflows

### 14.1 App launch

1. Load `GET /api/branding` (cache the last successful result).
2. Restore cookies and call `GET /api/sales/me`.
3. On `401`, clear private cached representative data and show login.
4. On `403 ACCOUNT_INACTIVE` or `REPRESENTATIVE_PROFILE_UNAVAILABLE`, sign out and show the returned message.
5. After login, load dashboard and current trip.

### 14.2 Receive stock

1. List pending issues.
2. Open the selected issue and physically compare every line.
3. Confirm once and generate an idempotency UUID.
4. Call receive with that key.
5. On timeout, retry with the same key or reload the transfer before generating another command.

### 14.3 Create and post a sale

1. Load sale options during an operating trip.
2. Create a draft with location and a new idempotency key.
3. Render the server-returned prices/totals.
4. Optionally edit the draft; no location is sent on update.
5. Post with a new command key.
6. On an uncertain post result, retry with the same post key, then load the sale.

### 14.4 Offline behavior

Read-only cached data may be displayed as stale, but do not queue stock, sale, credit, trip, or cash mutations. Before retrying after reconnecting, refresh the relevant options/balances. Only an immediately retried uncertain command should reuse its original idempotency key.

## 15. Known integration constraints

- The API is session/cookie based; it does not currently provide OAuth, JWT, or a personal-access-token login response.
- Browser CORS in the checked production response allows `http://localhost:8000`; a separately hosted browser app will need its origin added server-side. Native Android networking is not subject to browser CORS.
- There is no API version prefix. Treat `/api` as the current v1 contract and coordinate breaking server changes with app releases.
- Partial stock receipt is not supported.
- The sales app cannot start or complete trips, return stock, confirm cash handovers, or void posted sales; those are office workflows.
- Payment methods are runtime configuration. Always use option endpoint data rather than assuming only `cash` and `banking`.
