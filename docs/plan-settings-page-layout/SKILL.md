---
name: plan-settings-page-layout
description: Plan, structure, or review responsive settings-page layouts for web applications using this inventory app's compact indexed-workspace pattern. Use when defining settings information architecture, section navigation, editor layouts, form grouping, save ownership, responsive behavior, or an implementation plan. Do not use for implementing an unrelated dashboard or ordinary data-entry form.
---

# Plan Settings Page Layout

## Produce the Plan

1. Inspect the target application's current shell, settings routes, shared form primitives, tokens, permissions, breakpoints, and save APIs.
2. Inventory every setting and classify it by scope:
   - account or user;
   - device-local preference;
   - organization-wide configuration;
   - operational rule;
   - security or permission management.
3. Group settings by user intent rather than database or API ownership. Keep frequently changed items easy to reach and isolate risky or privileged controls.
4. Choose navigation and save boundaries before specifying visual details. Prefer one focused section at a time when the full settings surface is broad.
5. Read [references/layout-pattern.md](references/layout-pattern.md) for this app's workspace anatomy, responsive rules, and planning checklist.
6. Deliver an implementation-ready plan containing:
   - section map and ordering;
   - desktop and mobile layout behavior;
   - form and subsection composition;
   - validation, loading, success, error, and unsaved-change behavior;
   - permission visibility and editability;
   - component reuse and required new components;
   - verification criteria.

## Preserve These Decisions

- Separate device-local preferences from server-persisted application settings in copy and save behavior.
- Give each editable section a clear owner and save action; do not imply that unrelated sections save together unless the API does so atomically.
- Keep feedback near the workspace and field errors next to their controls.
- Use progressive disclosure for complex or infrequent settings, while keeping section names and descriptions scannable.
- Plan loading, empty, read-only, permission-denied, save-in-progress, success, and failure states.
- Reuse the host application's density, color, typography, focus, and responsive conventions.
- Treat destructive settings as explicit actions with impact copy and confirmation proportional to risk.

## Avoid Premature Implementation

When asked only for planning, do not edit application code. Cite relevant files and components, describe concrete changes, and call out unresolved product decisions. Implement only when the request includes implementation.

