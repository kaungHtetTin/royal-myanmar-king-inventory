import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from './auth/session';
import { useSession, type SessionUser } from './auth/session-context';
import './bootstrap';
import { OfflineBanner, OFFLINE_TRANSACTION_MESSAGE } from './ui/offline-banner';
import { Button } from './ui/primitives';

function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('offline interface safety', () => {
    afterEach(() => {
        setOnline(true);
        window.localStorage.clear();
        window.sessionStorage.clear();
        vi.restoreAllMocks();
    });

    it('announces offline state and disables transaction actions', () => {
        setOnline(false);
        render(
            <>
                <OfflineBanner />
                <Button requiresOnline tone="primary">
                    Post sale
                </Button>
            </>,
        );

        expect(screen.getByRole('status')).toHaveTextContent(OFFLINE_TRANSACTION_MESSAGE);
        expect(screen.getByRole('button', { name: 'Post sale' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Post sale' })).toHaveAttribute('title', OFFLINE_TRANSACTION_MESSAGE);
    });

    it('restores the last authenticated shell identity when the server is offline', async () => {
        const user: SessionUser = {
            email: null,
            id: 7,
            is_active: true,
            last_login_at: null,
            name: 'Offline Operator',
            permissions: ['inventory.view'],
            roles: ['office-admin'],
            username: 'offline',
            warehouses: [],
        };
        window.localStorage.setItem('inventory.last_user', JSON.stringify(user));
        setOnline(false);
        vi.spyOn(window.axios, 'get').mockRejectedValue(new Error('Network Error'));

        function SessionState() {
            const session = useSession();
            return <span>{`${session.status}:${session.user?.name ?? 'none'}`}</span>;
        }

        render(
            <SessionProvider>
                <SessionState />
            </SessionProvider>,
        );

        await waitFor(() => expect(screen.getByText('authenticated:Offline Operator')).toBeInTheDocument());
    });
});
