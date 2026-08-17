# Phase 1 Status — Foundation, Authentication, and Authorization

**Status:** Complete  
**Started:** 17 August 2026
**Completed:** 17 August 2026

## Completed checkpoint

- [x] Laravel Sanctum 4 installed and stateful SPA middleware enabled.
- [x] Axios configured for same-origin credential and XSRF handling under flexible deployment paths.
- [x] Username-or-email session login with password verification and session regeneration.
- [x] Login throttling with a stable validation response.
- [x] Inactive accounts rejected at login and during an existing authenticated session.
- [x] Authenticated current-user, admin current-user, sales current-user, and logout endpoints.
- [x] Authentication success, failure, inactive rejection, and logout audit events.
- [x] Additive user-status and audit-log migrations applied to the local database.
- [x] Environment-driven, repeatable local Super Admin seed baseline.
- [x] Authentication feature tests cover login, logout, restoration, inactivity, invalid credentials, and unauthenticated endpoints.
- [x] Spatie permissions 6.25 installed from its official fixed Git tag and locked reproducibly.
- [x] Permission and role tables plus warehouse and user-assignment tables migrated.
- [x] All authorization-matrix permission names defined in a PHP enum and seeded.
- [x] Baseline Super Admin, Office Admin, and Sales Representative roles seeded.
- [x] Super Admin feature and warehouse-scope bypass implemented without bypassing authentication or active status.
- [x] Office Admin feature-permission and assigned-warehouse enforcement covered by tests.
- [x] Admin and representative backend portal boundaries enforced.
- [x] Separate compact admin and representative login screens implemented.
- [x] SPA session restoration, protected routes, logout, expired-session, inactive-account, and forbidden states implemented.
- [x] Permission-aware admin navigation and authenticated shell identity implemented.
- [x] Real XAMPP cookie/CSRF login, authorized request, and logout cycle verified below `/inventory/public`.
- [x] Sales Representative foundation links one login user to one representative and one primary warehouse.
- [x] Representative ownership policy and scoped-query service use the authenticated user's linked profile as authority.
- [x] Representative own-profile, tampered-ID, Office Admin warehouse-scope, and Super Admin access tests implemented.
- [x] Sales portal login rejects missing or inactive representative profiles.
- [x] Secured administration APIs support scoped user listing, creation, profile/status updates, role assignment, and warehouse assignment.
- [x] Role APIs support permission-aware listing, creation, and updates while protecting the built-in Super Admin role.
- [x] User and role access changes are transactional and audited, including previous and new access state.
- [x] User administration tests cover warehouse visibility, foreign assignment rejection, Super Admin protection, self-lockout prevention, and role counts.
- [x] Administration APIs verified through XAMPP below `/inventory/public` using the real Sanctum cookie/CSRF flow.
- [x] Compact user directory supports server-side search, status/role filters, pagination, profile editing, status changes, and access assignment.
- [x] Role management supports permission-aware listing, creation, and editing with protected built-in role behavior.
- [x] Management dialogs provide inline validation, explicit deactivation confirmation, Escape/backdrop closing, and sticky actions.
- [x] User and role management verified in compact light, comfortable dark, desktop, and 390 px mobile layouts.

## Completion checklist

- [x] Install and configure `spatie/laravel-permission`.
- [x] Seed the complete permission namespace and baseline Super Admin, Office Admin, and Sales Representative roles.
- [x] Add warehouse and user-warehouse assignment models and scoped query service.
- [x] Add representative ownership enforcement.
- [x] Enforce admin-versus-representative portal boundaries on the backend.
- [x] Build the separate admin and representative login screens.
- [x] Add SPA session restoration, protected routing, logout, forbidden, inactive, and expired-session states.
- [x] Build user, role, permission, and warehouse-assignment management screens.
- [x] Complete permission, warehouse-scope, ownership, Super Admin bypass, and route-boundary tests.

## Dependency note

Packagist remained unreachable during installation. Spatie 6.25 was therefore locked from the official tagged Git commit through a fixed Composer package repository definition. Spatie owns role/permission mechanics; project-owned access services own warehouse scope, representative ownership, and the rules governing which users an administrator may manage.

## Final verification

- `composer validate --strict` passed.
- `composer quality` passed with 26 backend tests and 109 assertions.
- `npm run quality` passed with 17 frontend tests.
- `npm run build` produced the production bundle successfully.
- Every protected Phase 1 API route is covered by unauthenticated-response assertions.
- Password hashing/non-disclosure and historical audit linkage after user deactivation are covered by regression tests.
- MySQL-backed XAMPP verification below `/inventory/public` passed for the SPA route, guest rejection, CSRF initialization, login, admin user/role APIs, admin-to-sales boundary, logout, and post-logout rejection.
- Compact light, comfortable dark, desktop, and 390 px mobile management layouts were visually verified. English remains the approved Phase 1 UI language; broader localization is assigned to Phase 8 by the architecture decisions.

## Handoff

Phase 1 exit criteria are satisfied. Phase 2 can begin with warehouse management, followed by products, vehicles, customers, and representative management.
