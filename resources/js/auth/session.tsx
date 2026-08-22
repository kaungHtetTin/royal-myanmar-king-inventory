import axios, { AxiosError } from 'axios';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    SessionContext,
    SessionError,
    type SessionContextValue,
    type SessionStatus,
    type SessionUser,
} from './session-context';
const sessionMarker = 'inventory.had_session';
const sessionUserCache = 'inventory.last_user';

function cachedUser(): SessionUser | null {
    try {
        const value = JSON.parse(window.localStorage.getItem(sessionUserCache) ?? 'null') as SessionUser | null;
        return value?.id && value.is_active && Array.isArray(value.roles) ? value : null;
    } catch {
        return null;
    }
}

function rememberUser(user: SessionUser) {
    window.localStorage.setItem(sessionUserCache, JSON.stringify(user));
    window.sessionStorage.setItem(sessionMarker, 'true');
}

function responseError(error: unknown): SessionError {
    if (!axios.isAxiosError(error)) {
        return new SessionError('Something went wrong. Please try again.');
    }

    const response = (
        error as AxiosError<{
            code?: string;
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new SessionError(
        response?.data.message ?? 'Unable to complete the request.',
        response?.data.code,
        response?.data.errors,
    );
}

export function SessionProvider({ children, initialUser }: { children: ReactNode; initialUser?: SessionUser | null }) {
    const [user, setUser] = useState<SessionUser | null>(initialUser ?? null);
    const [status, setStatus] = useState<SessionStatus>(
        initialUser === undefined ? 'restoring' : initialUser ? 'authenticated' : 'guest',
    );

    useEffect(() => {
        if (initialUser !== undefined) return;

        let active = true;
        window.axios
            .get<{ user: SessionUser }>('api/auth/user')
            .then(({ data }) => {
                if (!active) return;
                setUser(data.user);
                setStatus('authenticated');
                rememberUser(data.user);
            })
            .catch((error: AxiosError<{ code?: string }>) => {
                if (!active) return;
                const offlineUser = !navigator.onLine ? cachedUser() : null;
                if (offlineUser) {
                    setUser(offlineUser);
                    setStatus('authenticated');
                    return;
                }
                setUser(null);
                if (error.response?.data.code === 'ACCOUNT_INACTIVE') {
                    setStatus('inactive');
                } else {
                    setStatus(window.sessionStorage.getItem(sessionMarker) ? 'expired' : 'guest');
                }
            });

        return () => {
            active = false;
        };
    }, [initialUser]);

    const value = useMemo<SessionContextValue>(
        () => ({
            login: async (input) => {
                try {
                    await window.axios.get('sanctum/csrf-cookie');
                    const { data } = await window.axios.post<{
                        user: SessionUser;
                    }>('api/auth/login', input);
                    setUser(data.user);
                    setStatus('authenticated');
                    rememberUser(data.user);
                    return data.user;
                } catch (error) {
                    const sessionError = responseError(error);
                    throw sessionError;
                }
            },
            logout: async () => {
                try {
                    await window.axios.post('api/auth/logout');
                } finally {
                    setUser(null);
                    setStatus('guest');
                    window.sessionStorage.removeItem(sessionMarker);
                    window.localStorage.removeItem(sessionUserCache);
                }
            },
            status,
            updateUser: (changes) => {
                setUser((current) => {
                    if (!current) return current;
                    const next = { ...current, ...changes };
                    rememberUser(next);
                    return next;
                });
            },
            user,
        }),
        [status, user],
    );

    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
