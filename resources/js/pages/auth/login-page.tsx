import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SessionError, useSession, type Portal } from '../../auth/session-context';
import { useBranding } from '../../branding/branding-context';
import { Icon } from '../../ui/icons';
import { Button, IconButton } from '../../ui/primitives';
import { useUiPreferences } from '../../ui/preferences';

const portalContent = {
    admin: {
        eyebrow: 'Operations console',
        title: 'Office sign in',
        description: 'Manage warehouses, stock, sales, cash, and access control.',
        alternate: 'Representative app',
        alternatePath: '/sales/login',
    },
    sales: {
        eyebrow: 'Representative workspace',
        title: 'Route sign in',
        description: 'Access your stock, customers, sales, and cash position.',
        alternate: 'Admin console',
        alternatePath: '/admin/login',
    },
} as const;

export function LoginPage({ portal }: { portal: Portal }) {
    const content = portalContent[portal];
    const location = useLocation();
    const navigate = useNavigate();
    const { login, status, user } = useSession();
    const { theme, toggleTheme } = useUiPreferences();
    const { branding } = useBranding();
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (status === 'authenticated' && user) return <Navigate replace to={`/${portal}/dashboard`} />;

    const routeState = location.state as {
        expired?: boolean;
        from?: string;
    } | null;

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            await login({ login: identifier, password, portal, remember });
            const destination = routeState?.from?.startsWith(`/${portal}/`) ? routeState.from : `/${portal}/dashboard`;
            navigate(destination, { replace: true });
        } catch (caught) {
            const sessionError = caught instanceof SessionError ? caught : new SessionError('Unable to sign in.');
            setError(sessionError.fields?.login?.[0] ?? sessionError.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main
            className="login-root"
            data-theme={theme}
            style={{ '--color-primary': branding.primary_color } as CSSProperties}
        >
            <section className="login-brand-panel" aria-label={branding.business_name}>
                <div className="login-brand-lockup">
                    <span>
                        {branding.logo_url ? (
                            <img alt="" src={branding.logo_url} />
                        ) : (
                            <Icon name={portal === 'admin' ? 'building' : 'truck'} size={22} />
                        )}
                    </span>
                    <strong>{branding.business_name}</strong>
                </div>
                <div className="login-brand-message">
                    <p className="ui-eyebrow">Simple management. Strict transactions.</p>
                    <h1>
                        {portal === 'admin'
                            ? 'Your operation, clearly in view.'
                            : 'Your route, stock, and cash in one place.'}
                    </h1>
                    <p>Secure, auditable access designed for daily inventory work.</p>
                </div>
                <small>{branding.business_tagline || 'Stock & Inventory Management System'}</small>
            </section>

            <section className="login-form-panel">
                <div className="login-form-topbar">
                    <a href="#login-form" className="skip-link">
                        Skip to sign in
                    </a>
                    <IconButton
                        icon={theme === 'light' ? 'moon' : 'sun'}
                        label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}
                        onClick={toggleTheme}
                    />
                </div>
                <form className="login-form" id="login-form" onSubmit={submit}>
                    <div className="login-heading">
                        <p className="ui-eyebrow">{content.eyebrow}</p>
                        <h2>{content.title}</h2>
                        <p>{content.description}</p>
                    </div>

                    {routeState?.expired ? (
                        <div className="login-notice" role="status">
                            <Icon name="bell" size={16} />
                            Your session expired. Sign in again to continue.
                        </div>
                    ) : null}
                    {error ? (
                        <div className="login-error" role="alert">
                            {error}
                        </div>
                    ) : null}

                    <label className="ui-field">
                        <span>Username or email</span>
                        <input
                            autoComplete="username"
                            autoFocus
                            value={identifier}
                            onChange={(event) => setIdentifier(event.target.value)}
                            required
                        />
                    </label>
                    <label className="ui-field">
                        <span>Password</span>
                        <input
                            autoComplete="current-password"
                            minLength={6}
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                        />
                    </label>
                    <label className="login-remember">
                        <input
                            checked={remember}
                            onChange={(event) => setRemember(event.target.checked)}
                            type="checkbox"
                        />{' '}
                        <span>Keep me signed in on this device</span>
                    </label>

                    <Button
                        className="login-submit"
                        disabled={submitting}
                        icon="chevronRight"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {submitting ? 'Signing in…' : 'Sign in securely'}
                    </Button>

                    <div className="login-alternate">
                        <span>Using the other workspace?</span>
                        <Link to={content.alternatePath}>{content.alternate}</Link>
                    </div>
                </form>
            </section>
        </main>
    );
}
