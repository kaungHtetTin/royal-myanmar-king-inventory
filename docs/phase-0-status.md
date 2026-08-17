# Phase 0 Status — Architecture and Project Setup

**Status:** In progress  
**Started:** 17 August 2026

## Completed

- [x] Laravel 12 application scaffolded at the repository root.
- [x] React, TypeScript, Vite, and Tailwind application baseline installed.
- [x] Separate `/admin/*` and `/sales/*` SPA route shells created.
- [x] `/api/health` and Laravel `/up` health endpoints available.
- [x] Composer and npm lockfiles generated.
- [x] PHPUnit, Pint, TypeScript, ESLint, Vitest, and production build commands configured.
- [x] Project-specific CI workflow configured.
- [x] Local setup commands documented.
- [x] Architecture decisions recorded.
- [x] Conceptual ERD recorded.
- [x] Transaction state machines recorded.
- [x] Authorization matrix recorded.
- [x] API and error-response conventions recorded.
- [x] Reference-number and idempotency approach recorded.
- [x] Dense admin and mobile-first representative UI shells established.
- [x] Shared theme, density, icon, panel, button, badge, metric, and empty-state primitives established.

## Pending verification

- [x] Run the documented `composer setup` workflow from the locked dependency state.
- [x] Run backend formatting and tests.
- [x] Run frontend typecheck, lint, tests, and production build.
- [x] Run database migrations and seed data against the local MySQL-compatible XAMPP database.
- [x] Verify admin/sales routes, health endpoints, and compiled assets through XAMPP HTTP.
- [x] Visually verify both route shells in light/dark desktop and narrow responsive layouts.
- [ ] Confirm CI passes from a clean checkout with empty dependency directories.

## Follow-ups before Phase 1 closes

- [ ] Confirm the production database/version; MySQL 8.0+ is the current recommendation.
- [ ] Decide whether to move to PHP 8.3+ and Laravel 13 before transaction modules begin.
- [ ] Install and configure Larastan/PHPStan when package metadata is reachable.
- [ ] Obtain business confirmation for all provisional decisions in `architecture/decisions.md` before their affected phase.

Phase 0 is complete only after the pending verification items pass and no architecture decision blocks Phase 1.
