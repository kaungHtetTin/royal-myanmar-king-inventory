import { createContext, useContext } from 'react';

export type Portal = 'admin' | 'sales';

export type SessionUser = {
    email: string | null;
    id: number;
    is_active: boolean;
    last_login_at: string | null;
    name: string;
    permissions: string[];
    representative_id?: number | null;
    roles: string[];
    username: string;
    warehouses: Array<{ code: string; id: number; name: string }>;
};

export type SessionStatus = 'authenticated' | 'expired' | 'guest' | 'inactive' | 'restoring';

export type LoginInput = {
    login: string;
    password: string;
    portal: Portal;
    remember: boolean;
};

export class SessionError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly fields?: Record<string, string[]>,
    ) {
        super(message);
    }
}

export type SessionContextValue = {
    login: (input: LoginInput) => Promise<SessionUser>;
    logout: () => Promise<void>;
    status: SessionStatus;
    updateUser: (changes: Partial<SessionUser>) => void;
    user: SessionUser | null;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
    const context = useContext(SessionContext);
    if (!context) throw new Error('useSession must be used inside SessionProvider.');
    return context;
}
