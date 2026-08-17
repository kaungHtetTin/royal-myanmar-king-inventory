import { Link } from 'react-router-dom';
import { Icon } from '../../ui/icons';
import type { Portal } from '../../auth/session-context';

type AccessState = 'forbidden' | 'inactive' | 'loading';

const content = {
    forbidden: ['Access denied', 'Your account does not have access to this application.'],
    inactive: ['Account inactive', 'Contact an administrator to reactivate your account.'],
    loading: ['Restoring session', 'Checking your secure session…'],
} satisfies Record<AccessState, [string, string]>;

export function AccessStatePage({ portal = 'admin', state }: { portal?: Portal; state: AccessState }) {
    const [title, description] = content[state];

    return (
        <main className="access-state-page">
            <section aria-live={state === 'loading' ? 'polite' : undefined} className="access-state-card">
                <span className={`access-state-icon ${state === 'loading' ? 'is-loading' : ''}`}>
                    <Icon name={state === 'loading' ? 'density' : 'users'} size={24} />
                </span>
                <p className="ui-eyebrow">StockFlow security</p>
                <h1>{title}</h1>
                <p>{description}</p>
                {state !== 'loading' ? (
                    <Link className="ui-button ui-button--primary" to={`/${portal}/login`}>
                        <span>Return to sign in</span>
                    </Link>
                ) : null}
            </section>
        </main>
    );
}
