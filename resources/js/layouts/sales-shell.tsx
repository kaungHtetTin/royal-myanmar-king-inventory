import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../auth/session-context';
import { useBranding } from '../branding/branding-context';
import { Icon, type IconName } from '../ui/icons';
import { PrintSettingsDialog } from '../ui/invoice-print-dialog';
import { OfflineBanner } from '../ui/offline-banner';
import { useOnlineStatus, useUiPreferences } from '../ui/preferences';
import { useLocale } from '../localization/locale-context';

const salesNavigation: Array<{ icon: IconName; label: string; to: string }> = [
    { icon: 'dashboard', label: 'Home', to: '/sales/dashboard' },
    { icon: 'truck', label: 'Trip', to: '/sales/trip' },
    { icon: 'plus', label: 'New sale', to: '/sales/new-sale' },
    { icon: 'sales', label: 'Sales', to: '/sales/sales-history' },
    { icon: 'cash', label: 'Cash', to: '/sales/cash-hold' },
];

const salesDesktopNavigation = [
    ...salesNavigation.slice(0, 2),
    { icon: 'box' as const, label: 'My stock', to: '/sales/my-stock' },
    ...salesNavigation.slice(2),
];

export function SalesShell({ children }: { children: ReactNode }) {
    const location = useLocation();
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
    const online = useOnlineStatus();
    const { density, fontScale, theme, toggleDensity, toggleTheme } = useUiPreferences();
    const { logout, user } = useSession();
    const { branding } = useBranding();
    const { locale, setLocale, t } = useLocale();

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
    const roleLabel = user?.roles[0]?.replaceAll('-', ' ') ?? t('Representative');

    return (
        <div
            className="sales-root"
            data-density={density}
            data-font-scale={fontScale}
            data-theme={theme}
            style={{ '--app-font-scale': fontScale, '--color-primary': branding.primary_color } as CSSProperties}
        >
            <a className="skip-link" href="#sales-content">
                {t('Skip to content')}
            </a>
            <div className="sales-app-frame">
                <header className="sales-topbar">
                    <Link
                        aria-label={t('{business} home', { business: branding.business_name })}
                        className="sales-company-brand"
                        to="/sales/dashboard"
                    >
                        <span className="sales-company-brand__mark" aria-hidden="true">
                            {branding.logo_url ? <img alt="" src={branding.logo_url} /> : <Icon name="box" size={18} />}
                        </span>
                        <span className="sales-company-brand__copy">
                            <strong>{branding.business_name}</strong>
                            <small>{t('Sales workspace')}</small>
                        </span>
                    </Link>
                    <div className="sales-topbar__end">
                        <div className="sales-topbar__actions">
                            <span className={`connection-state ${online ? 'is-online' : 'is-offline'}`}>
                                <span aria-hidden="true" />
                                {t(online ? 'Online' : 'Offline')}
                            </span>
                        </div>
                        <div className="sales-profile-menu" ref={profileMenuRef}>
                            <button
                                aria-controls="sales-profile-dropdown"
                                aria-expanded={profileMenuOpen}
                                aria-haspopup="menu"
                                aria-label={t('Profile menu')}
                                className="sales-identity sales-profile-trigger"
                                onClick={() => setProfileMenuOpen((value) => !value)}
                                type="button"
                            >
                                <span className="sales-identity__avatar">{initials}</span>
                                <span className="sales-identity__copy">
                                    <small>{t('Representative')}</small>
                                    <strong>{user?.name ?? t('Representative')}</strong>
                                </span>
                                <Icon name="chevronDown" size={13} />
                            </button>
                            {profileMenuOpen ? (
                                <div
                                    aria-label={t('Profile options')}
                                    className="admin-profile-dropdown sales-profile-dropdown"
                                    id="sales-profile-dropdown"
                                    role="menu"
                                >
                                    <div className="admin-profile-dropdown__identity">
                                        <span className="sales-identity__avatar">{initials}</span>
                                        <span>
                                            <strong>{user?.name ?? t('Representative')}</strong>
                                            <small>
                                                @{user?.username ?? 'user'} · {roleLabel}
                                            </small>
                                        </span>
                                    </div>
                                    <div className="admin-profile-dropdown__section">
                                        <Link
                                            onClick={() => setProfileMenuOpen(false)}
                                            role="menuitem"
                                            to="/sales/customers"
                                        >
                                            <Icon name="customers" size={16} />
                                            <span>{t('Customers')}</span>
                                        </Link>
                                        <Link
                                            onClick={() => setProfileMenuOpen(false)}
                                            role="menuitem"
                                            to="/sales/profile"
                                        >
                                            <Icon name="users" size={16} />
                                            <span>{t('Profile & security')}</span>
                                        </Link>
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

                <nav className="sales-desktop-nav" aria-label={t('Representative navigation')}>
                    {salesDesktopNavigation.map((item) => {
                        const active =
                            location.pathname === item.to ||
                            (item.to === '/sales/sales-history' && location.pathname.startsWith(`${item.to}/`));
                        return (
                            <Link
                                aria-current={active ? 'page' : undefined}
                                className={active ? 'is-active' : ''}
                                key={item.to}
                                to={item.to}
                            >
                                <Icon name={item.icon} size={16} />
                                {t(item.label)}
                            </Link>
                        );
                    })}
                </nav>

                <main className="sales-content" id="sales-content" tabIndex={-1}>
                    {children}
                </main>

                <nav className="sales-bottom-nav" aria-label={t('Representative navigation')}>
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
                                <span>{t(item.label)}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
            <PrintSettingsDialog onClose={() => setPrintSettingsOpen(false)} open={printSettingsOpen} />
        </div>
    );
}
