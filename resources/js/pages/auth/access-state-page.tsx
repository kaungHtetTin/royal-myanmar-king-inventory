import { Link } from 'react-router-dom';
import { Icon } from '../../ui/icons';
import type { Portal } from '../../auth/session-context';
import { useLocale } from '../../localization/locale-context';

type AccessState = 'forbidden' | 'inactive' | 'loading';

const content = {
    forbidden: ['Access denied', 'Your account does not have access to this application.'],
    inactive: ['Account inactive', 'Contact an administrator to reactivate your account.'],
    loading: ['Restoring session', 'Checking your secure session…'],
} satisfies Record<AccessState, [string, string]>;

export function AccessStatePage({ portal = 'admin', state }: { portal?: Portal; state: AccessState }) {
    const [title, description] = content[state];
    const { t } = useLocale();

    return (
        <main className="access-state-page">
            <section aria-live={state === 'loading' ? 'polite' : undefined} className="access-state-card">
                <span className={`access-state-icon ${state === 'loading' ? 'is-loading' : ''}`}>
                    <Icon name={state === 'loading' ? 'density' : 'users'} size={24} />
                </span>
                <p className="ui-eyebrow">{t('StockFlow security')}</p>
                <h1>{t(title)}</h1>
                <p>{t(description)}</p>
                {state !== 'loading' ? (
                    <Link className="ui-button ui-button--primary" to={`/${portal}/login`}>
                        <span>{t('Return to sign in')}</span>
                    </Link>
                ) : null}
            </section>
        </main>
    );
}
