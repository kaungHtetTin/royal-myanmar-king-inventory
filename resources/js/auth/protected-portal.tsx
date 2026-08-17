import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AccessStatePage } from '../pages/auth/access-state-page';
import { useSession, type Portal } from './session-context';

export function ProtectedPortal({ children, portal }: { children: ReactNode; portal: Portal }) {
    const location = useLocation();
    const { status, user } = useSession();

    if (status === 'restoring') return <AccessStatePage state="loading" />;
    if (status === 'inactive') return <AccessStatePage portal={portal} state="inactive" />;
    if (status === 'expired')
        return <Navigate replace state={{ expired: true, from: location.pathname }} to={`/${portal}/login`} />;
    if (!user) return <Navigate replace state={{ from: location.pathname }} to={`/${portal}/login`} />;

    const allowed =
        portal === 'admin'
            ? user.roles.some((role) => role === 'super-admin' || role === 'office-admin')
            : user.roles.includes('sales-representative');

    if (!allowed) return <AccessStatePage portal={portal} state="forbidden" />;
    return children;
}
