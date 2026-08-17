import { Icon } from './icons';
import { useOnlineStatus } from './preferences';

export const OFFLINE_TRANSACTION_MESSAGE = 'Internet connection is required to complete this transaction.';

export function OfflineBanner() {
    const online = useOnlineStatus();

    if (online) return null;

    return (
        <div className="offline-banner" role="status">
            <Icon name="warning" size={16} />
            <span>
                <strong>You are offline.</strong> Read-only screens may remain available. {OFFLINE_TRANSACTION_MESSAGE}
            </span>
        </div>
    );
}
