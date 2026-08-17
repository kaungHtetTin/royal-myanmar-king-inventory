import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { Icon } from '../../ui/icons';
import { StatusBadge } from '../../ui/primitives';

const stock = [
    { name: 'Premium Drinking Water 1L', sku: 'WTR-001', quantity: 70 },
    { name: 'Mineral Water 500ml', sku: 'WTR-002', quantity: 25 },
    { name: 'Sparkling Water 330ml', sku: 'WTR-003', quantity: 90 },
];

export function SalesFoundationPage() {
    const { user } = useSession();

    return (
        <div className="sales-dashboard">
            <header className="sales-page-heading">
                <div>
                    <p>Monday, 17 August</p>
                    <h1>Good morning, {user?.name ?? 'Representative'}</h1>
                </div>
                <StatusBadge tone="success">Route active</StatusBadge>
            </header>

            <section className="sales-summary-grid" aria-label="Today's summary">
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="cash" size={18} />
                    </span>
                    <small>Cash hold</small>
                    <strong>1,700,000</strong>
                    <p>MMK currently held</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="sales" size={18} />
                    </span>
                    <small>Today's sales</small>
                    <strong>1,250,000</strong>
                    <p>850K cash · 400K credit</p>
                </article>
            </section>

            <Link className="sales-primary-action" to="/sales/new-sale">
                <span>
                    <Icon name="plus" size={21} />
                </span>
                <div>
                    <strong>Create new sale</strong>
                    <small>Cash or customer credit</small>
                </div>
                <Icon name="chevronRight" />
            </Link>

            <section className="sales-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">Inventory</p>
                        <h2>My stock</h2>
                    </div>
                    <Link to="/sales/my-stock">View all</Link>
                </header>
                <div className="sales-stock-list">
                    {stock.map((item) => (
                        <article key={item.sku}>
                            <span className="sales-stock-list__icon">
                                <Icon name="box" size={17} />
                            </span>
                            <div>
                                <strong>{item.name}</strong>
                                <small>{item.sku}</small>
                            </div>
                            <span className="sales-stock-list__quantity">
                                <strong>{item.quantity}</strong>
                                <small>units</small>
                            </span>
                        </article>
                    ))}
                </div>
            </section>

            <section className="sales-section sales-pending">
                <header>
                    <div>
                        <p className="ui-eyebrow">Receiving</p>
                        <h2>Pending stock</h2>
                    </div>
                    <StatusBadge tone="warning">2 pending</StatusBadge>
                </header>
                <article>
                    <span className="sales-stock-list__icon">
                        <Icon name="truck" size={17} />
                    </span>
                    <div>
                        <strong>RTR-000241</strong>
                        <small>Yangon Main · 3 products</small>
                    </div>
                    <Icon name="chevronRight" />
                </article>
            </section>

            <p className="foundation-note">
                <strong>UI foundation preview.</strong> Sample values only; transactional actions remain disconnected.
            </p>
        </div>
    );
}
