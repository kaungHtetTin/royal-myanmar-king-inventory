import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession, type SessionUser } from '../auth/session-context';
import { useBranding } from '../branding/branding-context';
import { reportingApi } from '../services/reporting';
import { Icon, type IconName } from '../ui/icons';
import { PrintSettingsDialog } from '../ui/invoice-print-dialog';
import { IconButton } from '../ui/primitives';
import { OfflineBanner } from '../ui/offline-banner';
import { useOnlineStatus, useUiPreferences } from '../ui/preferences';
import { useLocale } from '../localization/locale-context';

type NavItem = {
    alert?: keyof NavAlertCounts;
    icon: IconName;
    label: string;
    permission?: string;
    to: string;
};

type NavAlertCounts = {
    cash: number;
    transfers: number;
};

type NavGroup = {
    items: NavItem[];
    label: string;
};

const navigation: NavGroup[] = [
    {
        label: 'Overview',
        items: [
            {
                icon: 'dashboard',
                label: 'Dashboard',
                permission: 'dashboard.view',
                to: '/admin/dashboard',
            },
            {
                icon: 'reports',
                label: 'Reports',
                permission: 'report.view',
                to: '/admin/reports',
            },
        ],
    },
    {
        label: 'Operations',
        items: [
            {
                icon: 'warehouse',
                label: 'Inventory',
                permission: 'inventory.view',
                to: '/admin/inventory',
            },
            {
                alert: 'transfers',
                icon: 'transfer',
                label: 'Transfers',
                permission: 'warehouse_transfer.view|representative_stock.view',
                to: '/admin/transfers',
            },
            {
                icon: 'truck',
                label: 'Trips',
                permission: 'trip.view',
                to: '/admin/trips',
            },
            {
                icon: 'sales',
                label: 'Sales',
                permission: 'sale.view',
                to: '/admin/sales',
            },
            {
                icon: 'customers',
                label: 'Customers',
                permission: 'customer.view',
                to: '/admin/customers',
            },
        ],
    },
    {
        label: 'Resources',
        items: [
            {
                icon: 'box',
                label: 'Products',
                permission: 'product.view',
                to: '/admin/products',
            },
            {
                icon: 'warehouse',
                label: 'Warehouses',
                permission: 'warehouse.view',
                to: '/admin/warehouses',
            },
            {
                icon: 'users',
                label: 'Representatives',
                permission: 'representative.view',
                to: '/admin/representatives',
            },
            {
                alert: 'cash',
                icon: 'cash',
                label: 'Cash & credit',
                permission: 'cash.view|customer_payment.view',
                to: '/admin/cash',
            },
            {
                icon: 'truck',
                label: 'Vehicles',
                permission: 'vehicle.view',
                to: '/admin/vehicles',
            },
        ],
    },
    {
        label: 'System',
        items: [
            {
                icon: 'users',
                label: 'Users',
                permission: 'user.manage',
                to: '/admin/users',
            },
            {
                icon: 'reports',
                label: 'Audit log',
                permission: 'audit.view',
                to: '/admin/audit-logs',
            },
            {
                icon: 'settings',
                label: 'Settings',
                permission: 'role.manage',
                to: '/admin/settings',
            },
            {
                icon: 'truck',
                label: 'Representative app',
                to: '/sales/dashboard',
            },
        ],
    },
];

const routeTitles: Record<string, string> = Object.fromEntries(
    navigation.flatMap((group) => group.items.map((item) => [item.to, item.label])),
);

function canAccess(permission: string | undefined, user: SessionUser | null) {
    return Boolean(
        !permission ||
        user?.roles.includes('super-admin') ||
        permission.split('|').some((name) => user?.permissions.includes(name)),
    );
}

type AdminShellProps = {
    children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
    const location = useLocation();
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [navAlerts, setNavAlerts] = useState<NavAlertCounts>({ cash: 0, transfers: 0 });
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('inventory.sidebar') === 'collapsed');
    const { density, fontScale, theme, toggleDensity, toggleTheme } = useUiPreferences();
    const online = useOnlineStatus();
    const { logout, user } = useSession();
    const { branding } = useBranding();
    const { locale, setLocale, t } = useLocale();
    const pageTitleKey = location.pathname.startsWith('/admin/representatives/')
        ? 'Representative details'
        : location.pathname.startsWith('/admin/warehouses/')
          ? 'Warehouse settings'
          : location.pathname.startsWith('/admin/trips/')
            ? 'Trip details'
          : (routeTitles[location.pathname] ?? 'Dashboard');
    const pageTitle = t(pageTitleKey);

    useEffect(() => {
        window.localStorage.setItem('inventory.sidebar', collapsed ? 'collapsed' : 'expanded');
    }, [collapsed]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMobileNavOpen(false);
                setProfileMenuOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (!profileMenuOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!profileMenuRef.current?.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [profileMenuOpen]);

    useEffect(() => {
        if (!online || !canAccess('dashboard.view', user)) return;

        let active = true;
        const loadAlerts = async () => {
            try {
                const dashboard = await reportingApi.adminDashboard();
                if (!active) return;
                setNavAlerts({
                    cash: dashboard.kpis.pending_cash_submissions,
                    transfers:
                        dashboard.kpis.pending_warehouse_transfers + dashboard.kpis.pending_representative_receivings,
                });
            } catch {
                // Navigation remains usable when alert counts cannot be refreshed.
            }
        };

        void loadAlerts();
        const refreshTimer = window.setInterval(() => void loadAlerts(), 60_000);
        return () => {
            active = false;
            window.clearInterval(refreshTimer);
        };
    }, [location.pathname, online, user]);

    const initials =
        user?.name
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() ?? 'U';
    const roleLabel = user?.roles[0]?.replaceAll('-', ' ') ?? t('Authenticated');

    return (
        <div
            className="admin-root"
            data-density={density}
            data-font-scale={fontScale}
            data-sidebar={collapsed ? 'collapsed' : 'expanded'}
            data-theme={theme}
            style={{ '--app-font-scale': fontScale, '--color-primary': branding.primary_color } as CSSProperties}
        >
            <a className="skip-link" href="#admin-content">
                {t('Skip to content')}
            </a>

            <button
                aria-label={t('Close navigation')}
                aria-hidden="true"
                className={`admin-nav-overlay ${mobileNavOpen ? 'is-visible' : ''}`}
                onClick={() => setMobileNavOpen(false)}
                tabIndex={-1}
                type="button"
            />

            <aside
                className={`admin-sidebar ${mobileNavOpen ? 'is-open' : ''}`}
                aria-label={t('Admin sidebar')}
                id="admin-sidebar"
            >
                <div className="admin-brand">
                    <span className="admin-brand__mark" aria-hidden="true">
                        {branding.logo_url ? <img alt="" src={branding.logo_url} /> : <Icon name="box" size={17} />}
                    </span>
                    <span className="admin-brand__copy">
                        <strong>{branding.business_name}</strong>
                        <small>{t('Operations console')}</small>
                    </span>
                    <IconButton
                        className="admin-sidebar__mobile-close"
                        icon="x"
                        label={t('Close navigation')}
                        onClick={() => setMobileNavOpen(false)}
                    />
                </div>

                <nav className="admin-navigation" aria-label={t('Admin navigation')}>
                    {navigation.map((group) => (
                        <div className="admin-nav-group" key={group.label}>
                            <p>{t(group.label)}</p>
                            {group.items
                                .filter((item) => canAccess(item.permission, user))
                                .map((item) => {
                                    const active =
                                        location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                                    const alertCount = item.alert ? navAlerts[item.alert] : 0;
                                    const alertLabel = alertCount
                                        ? t(
                                              alertCount === 1
                                                  ? '{label}, {count} action needs attention'
                                                  : '{label}, {count} actions need attention',
                                              { label: t(item.label), count: alertCount },
                                          )
                                        : t(item.label);

                                    return (
                                        <Link
                                            aria-current={active ? 'page' : undefined}
                                            aria-label={alertLabel}
                                            className={`admin-nav-item ${active ? 'is-active' : ''}`}
                                            key={item.to}
                                            onClick={() => setMobileNavOpen(false)}
                                            title={collapsed ? t(item.label) : undefined}
                                            to={item.to}
                                        >
                                            <Icon name={item.icon} size={17} />
                                            <span className="admin-nav-item__label">{t(item.label)}</span>
                                            {alertCount > 0 ? (
                                                <>
                                                    <span aria-hidden="true" className="admin-nav-alert">
                                                        {alertCount > 99 ? '99+' : alertCount}
                                                    </span>
                                                </>
                                            ) : null}
                                        </Link>
                                    );
                                })}
                        </div>
                    ))}
                </nav>

                <div className="admin-sidebar__footer">
                    <button
                        aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
                        className="admin-nav-item admin-collapse-control"
                        onClick={() => setCollapsed((value) => !value)}
                        title={t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
                        type="button"
                    >
                        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={17} />
                        <span className="admin-nav-item__label">
                            {t(collapsed ? 'Expand sidebar' : 'Collapse sidebar')}
                        </span>
                    </button>
                </div>
            </aside>

            <div className="admin-workspace">
                <header className="admin-topbar">
                    <div className="admin-topbar__start">
                        <IconButton
                            aria-controls="admin-sidebar"
                            aria-expanded={mobileNavOpen}
                            className="admin-mobile-menu"
                            icon="menu"
                            label={t('Open navigation')}
                            onClick={() => setMobileNavOpen(true)}
                        />
                        <div className="admin-breadcrumb">
                            <span>{t('Admin')}</span>
                            <Icon name="chevronRight" size={13} />
                            <strong>{pageTitle}</strong>
                        </div>
                    </div>

                    <div className="admin-topbar__actions">
                        <div className="admin-topbar__utilities">
                            <span className={`connection-state ${online ? 'is-online' : 'is-offline'}`}>
                                <span aria-hidden="true" />
                                {t(online ? 'Online' : 'Offline')}
                            </span>
                        </div>
                        <div className="admin-profile-menu" ref={profileMenuRef}>
                            <button
                                aria-controls="admin-profile-dropdown"
                                aria-expanded={profileMenuOpen}
                                aria-haspopup="menu"
                                aria-label={t('Profile menu')}
                                className="admin-profile"
                                onClick={() => setProfileMenuOpen((value) => !value)}
                                type="button"
                            >
                                <span className="admin-profile__avatar">{initials}</span>
                                <span className="admin-profile__copy">
                                    <strong>{user?.name ?? t('User')}</strong>
                                    <small>{roleLabel}</small>
                                </span>
                                <Icon name="chevronDown" size={13} />
                            </button>
                            {profileMenuOpen ? (
                                <div
                                    aria-label={t('Profile options')}
                                    className="admin-profile-dropdown"
                                    id="admin-profile-dropdown"
                                    role="menu"
                                >
                                    <div className="admin-profile-dropdown__identity">
                                        <span className="admin-profile__avatar">{initials}</span>
                                        <span>
                                            <strong>{user?.name ?? t('User')}</strong>
                                            <small>
                                                @{user?.username ?? 'user'} · {roleLabel}
                                            </small>
                                        </span>
                                    </div>
                                    <div className="admin-profile-dropdown__section">
                                        <button
                                            onClick={() => {
                                                toggleTheme();
                                                setProfileMenuOpen(false);
                                            }}
                                            role="menuitem"
                                            type="button"
                                        >
                                            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={16} />
                                            <span>{t(theme === 'light' ? 'Use dark theme' : 'Use light theme')}</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                toggleDensity();
                                                setProfileMenuOpen(false);
                                            }}
                                            role="menuitem"
                                            type="button"
                                        >
                                            <Icon name="density" size={16} />
                                            <span>
                                                {t(
                                                    density === 'compact'
                                                        ? 'Use comfortable density'
                                                        : 'Use compact density',
                                                )}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => setLocale(locale === 'en' ? 'my' : 'en')}
                                            role="menuitem"
                                            type="button"
                                        >
                                            <Icon name="adjustments" size={16} />
                                            <span>{locale === 'en' ? 'မြန်မာ' : 'English'}</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setProfileMenuOpen(false);
                                                setPrintSettingsOpen(true);
                                            }}
                                            role="menuitem"
                                            type="button"
                                        >
                                            <Icon name="print" size={16} />
                                            <span>{t('Print settings')}</span>
                                        </button>
                                        {canAccess('role.manage', user) ? (
                                            <Link
                                                onClick={() => setProfileMenuOpen(false)}
                                                role="menuitem"
                                                to="/admin/settings"
                                            >
                                                <Icon name="settings" size={16} />
                                                <span>{t('Settings')}</span>
                                            </Link>
                                        ) : null}
                                    </div>
                                    <div className="admin-profile-dropdown__section admin-profile-dropdown__section--signout">
                                        <button
                                            onClick={() => {
                                                setProfileMenuOpen(false);
                                                void logout();
                                            }}
                                            role="menuitem"
                                            type="button"
                                        >
                                            <Icon name="logout" size={16} />
                                            <span>{t('Sign out')}</span>
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </header>

                <OfflineBanner />

                <main className="admin-content" id="admin-content" tabIndex={-1}>
                    {children}
                </main>
            </div>
            <PrintSettingsDialog onClose={() => setPrintSettingsOpen(false)} open={printSettingsOpen} />
        </div>
    );
}
