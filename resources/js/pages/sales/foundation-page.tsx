import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { Icon } from '../../ui/icons';
import { StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const stock = [
    { name: 'Premium Drinking Water 1L', sku: 'WTR-001', quantity: 70 },
    { name: 'Mineral Water 500ml', sku: 'WTR-002', quantity: 25 },
    { name: 'Sparkling Water 330ml', sku: 'WTR-003', quantity: 90 },
];

export function SalesFoundationPage() {
    const { user } = useSession();
    const { formatNumber, t } = useLocale();

    return (
        <div className="sales-dashboard">
            <header className="sales-page-heading">
                <div>
                    <p>{t('Monday, 17 August')}</p>
                    <h1>{t('Good morning, {name}', { name: user?.name ?? t('Representative') })}</h1>
                </div>
                <StatusBadge tone="success">{t('Route active')}</StatusBadge>
            </header>

            <section className="sales-summary-grid" aria-label={t("Today's summary")}>
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="cash" size={18} />
                    </span>
                    <small>{t('Cash hold')}</small>
                    <strong>{formatNumber(1700000)}</strong>
                    <p>{t('MMK currently held')}</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="sales" size={18} />
                    </span>
                    <small>{t("Today's sales")}</small>
                    <strong>{formatNumber(1250000)}</strong>
                    <p>{t('850K cash · 400K credit')}</p>
                </article>
            </section>

            <Link className="sales-primary-action" to="/sales/new-sale">
                <span>
                    <Icon name="plus" size={21} />
                </span>
                <div>
                    <strong>{t('Create new sale')}</strong>
                    <small>{t('Cash or customer credit')}</small>
                </div>
                <Icon name="chevronRight" />
            </Link>

            <section className="sales-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">{t('Inventory')}</p>
                        <h2>{t('My stock')}</h2>
                    </div>
                    <Link to="/sales/my-stock">{t('View all')}</Link>
                </header>
                <div className="sales-stock-list">
                    {stock.map((item) => (
                        <article key={item.sku}>
                            <span className="sales-stock-list__icon">
                                <Icon name="box" size={17} />
                            </span>
                            <div>
                                <strong>{t(item.name)}</strong>
                                <small>{item.sku}</small>
                            </div>
                            <span className="sales-stock-list__quantity">
                                <strong>{formatNumber(item.quantity)}</strong>
                                <small>{t('units')}</small>
                            </span>
                        </article>
                    ))}
                </div>
            </section>

            <section className="sales-section sales-pending">
                <header>
                    <div>
                        <p className="ui-eyebrow">{t('Receiving')}</p>
                        <h2>{t('Pending stock')}</h2>
                    </div>
                    <StatusBadge tone="warning">{t('2 pending')}</StatusBadge>
                </header>
                <article>
                    <span className="sales-stock-list__icon">
                        <Icon name="truck" size={17} />
                    </span>
                    <div>
                        <strong>RTR-000241</strong>
                        <small>{t('Yangon Main · 3 products')}</small>
                    </div>
                    <Icon name="chevronRight" />
                </article>
            </section>

            <p className="foundation-note">
                <strong>{t('UI foundation preview.')}</strong>{' '}
                {t('Sample values only; transactional actions remain disconnected.')}
            </p>
        </div>
    );
}
