import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession, type SessionUser } from '../auth/session-context';
import { Icon, type IconName } from '../ui/icons';
import { IconButton } from '../ui/primitives';
import { OfflineBanner } from '../ui/offline-banner';
import { useOnlineStatus, useUiPreferences } from '../ui/preferences';

type NavItem = {
    icon: IconName;
    label: string;
    permission: string;
    to: string;
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
                icon: 'transfer',
                label: 'Transfers',
                permission: 'warehouse_transfer.view|representative_stock.view',
                to: '/admin/transfers',
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
            {
                icon: 'reports',
                label: 'Reports',
                permission: 'report.view',
                to: '/admin/reports',
            },
        ],
    },
    {
        label: 'System',
        items: [
            {
                icon: 'users',
                label: 'Users & roles',
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
        ],
    },
];

const routeTitles: Record<string, string> = Object.fromEntries(
    navigation.flatMap((group) => group.items.map((item) => [item.to, item.label])),
);

function canAccess(permission: string, user: SessionUser | null) {
    return Boolean(
        user?.roles.includes('super-admin') || permission.split('|').some((name) => user?.permissions.includes(name)),
    );
}

type AdminShellProps = {
    children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
    const location = useLocation();
    const searchRef = useRef<HTMLInputElement>(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem('inventory.sidebar') === 'collapsed');
    const { density, theme, toggleDensity, toggleTheme } = useUiPreferences();
    const online = useOnlineStatus();
    const { logout, user } = useSession();
    const pageTitle = routeTitles[location.pathname] ?? 'Dashboard';

    useEffect(() => {
        window.localStorage.setItem('inventory.sidebar', collapsed ? 'collapsed' : 'expanded');
    }, [collapsed]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

            if (event.key === 'Escape') {
                setMobileNavOpen(false);
            }

            if (event.key === '/' && !isTyping) {
                event.preventDefault();
                searchRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div
            className="admin-root"
            data-density={density}
            data-sidebar={collapsed ? 'collapsed' : 'expanded'}
            data-theme={theme}
        >
            <a className="skip-link" href="#admin-content">
                Skip to content
            </a>

            <button
                aria-label="Close navigation"
                aria-hidden="true"
                className={`admin-nav-overlay ${mobileNavOpen ? 'is-visible' : ''}`}
                onClick={() => setMobileNavOpen(false)}
                tabIndex={-1}
                type="button"
            />

            <aside
                className={`admin-sidebar ${mobileNavOpen ? 'is-open' : ''}`}
                aria-label="Admin sidebar"
                id="admin-sidebar"
            >
                <div className="admin-brand">
                    <span className="admin-brand__mark" aria-hidden="true">
                        <Icon name="box" size={17} />
                    </span>
                    <span className="admin-brand__copy">
                        <strong>StockFlow</strong>
                        <small>Operations console</small>
                    </span>
                    <IconButton
                        className="admin-sidebar__mobile-close"
                        icon="x"
                        label="Close navigation"
                        onClick={() => setMobileNavOpen(false)}
                    />
                </div>

                <nav className="admin-navigation" aria-label="Admin navigation">
                    {navigation.map((group) => (
                        <div className="admin-nav-group" key={group.label}>
                            <p>{group.label}</p>
                            {group.items
                                .filter((item) => canAccess(item.permission, user))
                                .map((item) => {
                                    const active =
                                        location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);

                                    return (
                                        <Link
                                            aria-current={active ? 'page' : undefined}
                                            className={`admin-nav-item ${active ? 'is-active' : ''}`}
                                            key={item.to}
                                            onClick={() => setMobileNavOpen(false)}
                                            title={collapsed ? item.label : undefined}
                                            to={item.to}
                                        >
                                            <Icon name={item.icon} size={17} />
                                            <span>{item.label}</span>
                                        </Link>
                                    );
                                })}
                        </div>
                    ))}
                </nav>

                <div className="admin-sidebar__footer">
                    <Link
                        className="portal-switch"
                        onClick={() => setMobileNavOpen(false)}
                        to="/sales/dashboard"
                        title="Open representative app"
                    >
                        <Icon name="truck" size={17} />
                        <span>Representative app</span>
                        <Icon className="portal-switch__arrow" name="chevronRight" size={14} />
                    </Link>
                    <button
                        className="admin-nav-item admin-collapse-control"
                        onClick={() => setCollapsed((value) => !value)}
                        type="button"
                    >
                        <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={17} />
                        <span>Collapse sidebar</span>
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
                            label="Open navigation"
                            onClick={() => setMobileNavOpen(true)}
                        />
                        <div className="admin-breadcrumb">
                            <span>Admin</span>
                            <Icon name="chevronRight" size={13} />
                            <strong>{pageTitle}</strong>
                        </div>
                    </div>

                    <label className="admin-search">
                        <Icon name="search" size={15} />
                        <span className="sr-only">Search the application</span>
                        <input ref={searchRef} placeholder="Search anything…" type="search" />
                        <kbd>/</kbd>
                    </label>

                    <div className="admin-topbar__actions">
                        <span className={`connection-state ${online ? 'is-online' : 'is-offline'}`}>
                            <span aria-hidden="true" />
                            {online ? 'Online' : 'Offline'}
                        </span>
                        <IconButton
                            icon={theme === 'light' ? 'moon' : 'sun'}
                            label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}
                            onClick={toggleTheme}
                        />
                        <IconButton
                            icon="density"
                            label={`Use ${density === 'compact' ? 'comfortable' : 'compact'} density`}
                            onClick={toggleDensity}
                        />
                        <IconButton icon="bell" label="Notifications" />
                        <IconButton icon="logout" label="Sign out" onClick={() => void logout()} />
                        <button className="admin-profile" type="button">
                            <span className="admin-profile__avatar">
                                {user?.name
                                    .split(/\s+/)
                                    .map((part) => part[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase() ?? 'U'}
                            </span>
                            <span className="admin-profile__copy">
                                <strong>{user?.name ?? 'User'}</strong>
                                <small>{user?.roles[0]?.replaceAll('-', ' ') ?? 'Authenticated'}</small>
                            </span>
                            <Icon name="chevronDown" size={13} />
                        </button>
                    </div>
                </header>

                <OfflineBanner />

                <main className="admin-content" id="admin-content" tabIndex={-1}>
                    {children}
                </main>
            </div>
        </div>
    );
}
