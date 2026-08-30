import { Icon } from './icons';
import { useOnlineStatus } from './preferences';
import { useLocale } from '../localization/locale-context';

export const OFFLINE_TRANSACTION_MESSAGE = 'Internet connection is required to complete this transaction.';

export function OfflineBanner() {
    const online = useOnlineStatus();
    const { t } = useLocale();

    if (online) return null;

    return (
        <div className="offline-banner" role="status">
            <Icon name="warning" size={16} />
            <span>
                <strong>{t('You are offline.')}</strong> {t('Read-only screens may remain available.')}{' '}
                {t(OFFLINE_TRANSACTION_MESSAGE)}
            </span>
        </div>
    );
}
