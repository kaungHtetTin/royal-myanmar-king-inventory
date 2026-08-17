# UI Shell Foundation

The Phase 0 SPA foundation provides two related application shells:

- `/admin/*` uses a dense desktop operations console with a fixed, collapsible sidebar, sticky top bar, keyboard search shortcut, responsive drawer, and permission-ready navigation configuration.
- `/sales/*` uses a mobile-first representative workspace with large touch targets, a focused action hierarchy, safe-area-aware fixed bottom navigation, and a wider-screen navigation bar.

The dashboard content is intentionally sample data. It validates the layout and component system; transactional controls remain disconnected until their roadmap phases.

## Design baseline

| Element | Compact baseline |
| --- | ---: |
| Admin sidebar | 204px |
| Collapsed sidebar | 56px |
| Admin top bar | 44px |
| Page padding | 14px |
| Section gap | 10px |
| Standard control | 34px |
| Compact table row | approximately 42px |
| Mobile touch target | at least 40px |

The visual system uses teal `#087f74` as the operational accent, Inter with Noto Sans Myanmar and system-font fallbacks, restrained shadows, semantic status colors, and tabular numerals for quantities and money.

## Shared implementation

- `resources/css/app.css` owns tokens, density rules, responsive behavior, light/dark themes, focus treatment, reduced-motion support, and shell component styling.
- `resources/js/ui/icons.tsx` provides one consistent inline SVG icon vocabulary without emoji or platform-dependent glyphs.
- `resources/js/ui/preferences.ts` owns persistent theme and density preferences plus live online/offline state.
- `resources/js/ui/primitives.tsx` provides buttons, icon buttons, panels, badges, metric cards, and empty states.
- `resources/js/layouts/admin-shell.tsx` and `resources/js/layouts/sales-shell.tsx` own global navigation and portal-specific chrome.

## Extension rules

Feature phases should render page content inside the appropriate shell and reuse the shared primitives. Keep filters compact, put page actions beside the heading, use panels for grouped work, reserve semantic colors for state, and make backend authorization authoritative even when navigation is permission-filtered.

Phase 1 adds matching admin and representative authentication layouts, persistent session restoration, portal guards, and explicit loading, expired-session, inactive-account, and forbidden states. Login forms use the same theme tokens and retain 40px touch targets at narrow widths.

All internal links remain React Router links. The router basename and Axios base URL continue to come from Laravel's runtime deployment path, so these shells work at the domain root or below paths such as `/inventory/public` without rebuilding assets.

## Verification baseline

The foundation is covered by route-shell, nested-deployment, preference persistence, and mobile-drawer interaction tests. The production build was rendered through XAMPP at desktop and narrow widths in light and dark themes. Future feature phases should retain these checks and add loading, empty, error, success, overflow, and long-content states for each screen.
