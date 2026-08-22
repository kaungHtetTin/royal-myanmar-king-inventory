import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../auth/session-context';
import { Icon, type IconName } from '../ui/icons';
import { IconButton } from '../ui/primitives';
import { OfflineBanner } from '../ui/offline-banner';
import { useOnlineStatus, useUiPreferences } from '../ui/preferences';

const salesNavigation: Array<{ icon: IconName; label: string; to: string }> = [
    { icon: 'dashboard', label: 'Home', to: '/sales/dashboard' },
    { icon: 'box', label: 'My stock', to: '/sales/my-stock' },
    { icon: 'plus', label: 'New sale', to: '/sales/new-sale' },
    { icon: 'reports', label: 'Reports', to: '/sales/reports' },
    { icon: 'cash', label: 'Cash', to: '/sales/cash-hold' },
];

export function SalesShell({ children }: { children: ReactNode }) {
    const location = useLocation();
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const online = useOnlineStatus();
    const { density, theme, toggleDensity, toggleTheme } = useUiPreferences();
    const { logout, user } = useSession();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setProfileMenuOpen(false);
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

    const initials =
        user?.name
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() ?? 'U';
    const roleLabel = user?.roles[0]?.replaceAll('-', ' ') ?? 'Representative';

    return (
        <div className="sales-root" data-density={density} data-theme={theme}>
            <a className="skip-link" href="#sales-content">
                Skip to content
            </a>
            <div className="sales-app-frame">
                <header className="sales-topbar">
                    <Link aria-label="StockFlow home" className="sales-company-brand" to="/sales/dashboard">
                        <span className="sales-company-brand__mark" aria-hidden="true">
                            <Icon name="box" size={18} />
                        </span>
                        <span className="sales-company-brand__copy">
                            <strong>StockFlow</strong>
                            <small>Sales workspace</small>
                        </span>
                    </Link>
                    <div className="sales-topbar__end">
                        <div className="sales-topbar__actions">
                            <span className={`connection-state ${online ? 'is-online' : 'is-offline'}`}>
                                <span aria-hidden="true" />
                                {online ? 'Online' : 'Offline'}
                            </span>
                            <IconButton icon="bell" label="Notifications" />
                        </div>
                        <div className="sales-profile-menu" ref={profileMenuRef}>
                            <button
                                aria-controls="sales-profile-dropdown"
                                aria-expanded={profileMenuOpen}
                                aria-haspopup="menu"
                                aria-label="Profile menu"
                                className="sales-identity sales-profile-trigger"
                                onClick={() => setProfileMenuOpen((value) => !value)}
                                type="button"
                            >
                                <span className="sales-identity__avatar">{initials}</span>
                                <span className="sales-identity__copy">
                                    <small>Representative</small>
                                    <strong>{user?.name ?? 'Representative'}</strong>
                                </span>
                                <Icon name="chevronDown" size={13} />
                            </button>
                            {profileMenuOpen ? (
                                <div
                                    aria-label="Profile options"
                                    className="admin-profile-dropdown sales-profile-dropdown"
                                    id="sales-profile-dropdown"
                                    role="menu"
                                >
                                    <div className="admin-profile-dropdown__identity">
                                        <span className="sales-identity__avatar">{initials}</span>
                                        <span>
                                            <strong>{user?.name ?? 'Representative'}</strong>
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
                                            <span>Use {theme === 'light' ? 'dark' : 'light'} theme</span>
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
                                            <span>Use {density === 'compact' ? 'comfortable' : 'compact'} density</span>
                                        </button>
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
                                            <span>Sign out</span>
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </header>

                <OfflineBanner />

                <nav className="sales-desktop-nav" aria-label="Representative navigation">
                    {salesNavigation.map((item) => {
                        const active = location.pathname === item.to;
                        return (
                            <Link
                                aria-current={active ? 'page' : undefined}
                                className={active ? 'is-active' : ''}
                                key={item.to}
                                to={item.to}
                            >
                                <Icon name={item.icon} size={16} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <main className="sales-content" id="sales-content" tabIndex={-1}>
                    {children}
                </main>

                <nav className="sales-bottom-nav" aria-label="Representative navigation">
                    {salesNavigation.map((item) => {
                        const active = location.pathname === item.to;
                        return (
                            <Link
                                aria-current={active ? 'page' : undefined}
                                className={active ? 'is-active' : ''}
                                key={item.to}
                                to={item.to}
                            >
                                <Icon name={item.icon} size={20} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}
