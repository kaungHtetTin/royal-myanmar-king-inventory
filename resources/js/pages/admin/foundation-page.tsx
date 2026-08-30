import { Button, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const movements = [
    {
        reference: 'WTR-000128',
        detail: 'Yangon → Mandalay',
        product: 'Premium Drinking Water 1L',
        quantity: '300',
        status: 'In transit',
        tone: 'info' as const,
        time: '10:42',
    },
    {
        reference: 'RTR-000241',
        detail: 'Yangon → SR-018',
        product: 'Mineral Water 500ml',
        quantity: '40',
        status: 'Pending receipt',
        tone: 'warning' as const,
        time: '10:16',
    },
    {
        reference: 'IMP-000126',
        detail: 'Yangon Main Warehouse',
        product: 'Assorted products',
        quantity: '4,800',
        status: 'Posted',
        tone: 'success' as const,
        time: '09:34',
    },
    {
        reference: 'SAL-001842',
        detail: 'SR-006 → Golden Star Shop',
        product: '4 line items',
        quantity: '22',
        status: 'Cash sale',
        tone: 'neutral' as const,
        time: '09:08',
    },
    {
        reference: 'ADJ-000033',
        detail: 'Mandalay Warehouse',
        product: 'Sparkling Water 330ml',
        quantity: '-6',
        status: 'Adjusted',
        tone: 'danger' as const,
        time: '08:51',
    },
];

export function AdminFoundationPage() {
    const { formatNumber, t } = useLocale();

    return (
        <div className="admin-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Monday, 17 August')}</p>
                    <h1>{t('Operations overview')}</h1>
                    <p>{t('Inventory, sales, and settlement activity across accessible warehouses.')}</p>
                </div>
                <Button icon="plus" tone="primary">
                    {t('New stock import')}
                </Button>
            </header>

            <section className="metric-grid" aria-label={t('Key performance indicators')}>
                <MetricCard
                    hint={t('Across 3 warehouses')}
                    icon="warehouse"
                    label={t('Warehouse stock')}
                    value={formatNumber(24680)}
                />
                <MetricCard
                    hint={t('12 awaiting receipt')}
                    icon="box"
                    label={t('Representative stock')}
                    value={formatNumber(8420)}
                />
                <MetricCard hint={t('+8.4% from yesterday')} icon="sales" label={t("Today's sales")} value="8.42M" />
                <MetricCard
                    hint={t('27 active credit accounts')}
                    icon="cash"
                    label={t('Outstanding credit')}
                    value="12.6M"
                />
            </section>

            <div className="dashboard-grid">
                <Panel
                    actions={<Button tone="ghost">{t('View movement ledger')}</Button>}
                    eyebrow={t('Live ledger')}
                    title={t('Recent stock movements')}
                >
                    <div className="ui-table-wrap">
                        <table className="ui-table">
                            <thead>
                                <tr>
                                    <th>{t('Reference')}</th>
                                    <th>{t('Product / route')}</th>
                                    <th className="is-numeric">{t('Qty')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Time')}</th>
                                    <th className="ui-table__actions">
                                        <span className="sr-only">{t('Actions')}</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {movements.map((movement) => (
                                    <tr key={movement.reference}>
                                        <td>
                                            <strong>{movement.reference}</strong>
                                        </td>
                                        <td>
                                            <span className="table-primary">{t(movement.product)}</span>
                                            <small>{t(movement.detail)}</small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(Number(movement.quantity.replace(',', '')))}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={movement.tone}>{t(movement.status)}</StatusBadge>
                                        </td>
                                        <td className="table-muted">{movement.time}</td>
                                        <td className="ui-table__actions">
                                            <IconButton
                                                icon="chevronRight"
                                                label={t('Open {reference}', { reference: movement.reference })}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <footer className="table-footer">
                        <span>{t('Showing 5 latest movements')}</span>
                        <button type="button">{t('Previous')}</button>
                        <strong>1</strong>
                        <button type="button">{t('Next')}</button>
                    </footer>
                </Panel>

                <div className="dashboard-side-stack">
                    <Panel eyebrow={t('Attention')} title={t('Needs action')}>
                        <ul className="attention-list">
                            <li>
                                <span className="attention-icon is-warning">12</span>
                                <div>
                                    <strong>{t('Transfers awaiting receipt')}</strong>
                                    <small>{t('Oldest pending for 2 days')}</small>
                                </div>
                                <IconButton icon="chevronRight" label={t('View pending transfers')} />
                            </li>
                            <li>
                                <span className="attention-icon is-danger">6</span>
                                <div>
                                    <strong>{t('Low stock products')}</strong>
                                    <small>{t('Across 2 warehouses')}</small>
                                </div>
                                <IconButton icon="chevronRight" label={t('View low stock')} />
                            </li>
                            <li>
                                <span className="attention-icon is-info">9</span>
                                <div>
                                    <strong>{t('Cash submissions')}</strong>
                                    <small>{t('4.2M MMK pending confirmation')}</small>
                                </div>
                                <IconButton icon="chevronRight" label={t('View cash submissions')} />
                            </li>
                        </ul>
                    </Panel>

                    <Panel eyebrow={t('Shortcuts')} title={t('Quick actions')}>
                        <div className="quick-actions">
                            <Button icon="transfer">{t('Create transfer')}</Button>
                            <Button icon="adjustments">{t('Stock adjustment')}</Button>
                            <Button icon="cash">{t('Record payment')}</Button>
                            <Button icon="reports">{t('Open reports')}</Button>
                        </div>
                    </Panel>
                </div>
            </div>

            <p className="foundation-note">
                <strong>{t('UI foundation preview.')}</strong>{' '}
                {t('Values are sample data and no transaction actions are connected yet.')}
            </p>
        </div>
    );
}
