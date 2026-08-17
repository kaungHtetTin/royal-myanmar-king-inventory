import type { ReactNode } from 'react';
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
    const online = useOnlineStatus();
    const { density, theme, toggleTheme } = useUiPreferences();
    const { logout, user } = useSession();
    const initials =
        user?.name
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() ?? 'U';

    return (
        <div className="sales-root" data-density={density} data-theme={theme}>
            <a className="skip-link" href="#sales-content">
                Skip to content
            </a>
            <div className="sales-app-frame">
                <header className="sales-topbar">
                    <div className="sales-identity">
                        <span className="sales-identity__avatar">{initials}</span>
                        <span>
                            <small>Welcome back</small>
                            <strong>{user?.name ?? 'Representative'}</strong>
                        </span>
                    </div>
                    <div className="sales-topbar__actions">
                        <span className={`connection-state ${online ? 'is-online' : 'is-offline'}`}>
                            <span aria-hidden="true" />
                            {online ? 'Online' : 'Offline'}
                        </span>
                        <IconButton
                            icon={theme === 'light' ? 'moon' : 'sun'}
                            label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}
                            onClick={toggleTheme}
                        />
                        <IconButton icon="bell" label="Notifications" />
                        <IconButton icon="logout" label="Sign out" onClick={() => void logout()} />
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
                    <Link className="sales-admin-link" to="/admin/dashboard">
                        <Icon name="building" size={16} />
                        Admin console
                    </Link>
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
