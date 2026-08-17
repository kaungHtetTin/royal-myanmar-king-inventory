import { Button, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

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
    return (
        <div className="admin-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Monday, 17 August</p>
                    <h1>Operations overview</h1>
                    <p>Inventory, sales, and settlement activity across accessible warehouses.</p>
                </div>
                <Button icon="plus" tone="primary">
                    New stock import
                </Button>
            </header>

            <section className="metric-grid" aria-label="Key performance indicators">
                <MetricCard hint="Across 3 warehouses" icon="warehouse" label="Warehouse stock" value="24,680" />
                <MetricCard hint="12 awaiting receipt" icon="box" label="Representative stock" value="8,420" />
                <MetricCard hint="+8.4% from yesterday" icon="sales" label="Today's sales" value="8.42M" />
                <MetricCard hint="27 active credit accounts" icon="cash" label="Outstanding credit" value="12.6M" />
            </section>

            <div className="dashboard-grid">
                <Panel
                    actions={<Button tone="ghost">View movement ledger</Button>}
                    eyebrow="Live ledger"
                    title="Recent stock movements"
                >
                    <div className="ui-table-wrap">
                        <table className="ui-table">
                            <thead>
                                <tr>
                                    <th>Reference</th>
                                    <th>Product / route</th>
                                    <th className="is-numeric">Qty</th>
                                    <th>Status</th>
                                    <th>Time</th>
                                    <th className="ui-table__actions">
                                        <span className="sr-only">Actions</span>
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
                                            <span className="table-primary">{movement.product}</span>
                                            <small>{movement.detail}</small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{movement.quantity}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={movement.tone}>{movement.status}</StatusBadge>
                                        </td>
                                        <td className="table-muted">{movement.time}</td>
                                        <td className="ui-table__actions">
                                            <IconButton icon="chevronRight" label={`Open ${movement.reference}`} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <footer className="table-footer">
                        <span>Showing 5 latest movements</span>
                        <button type="button">Previous</button>
                        <strong>1</strong>
                        <button type="button">Next</button>
                    </footer>
                </Panel>

                <div className="dashboard-side-stack">
                    <Panel eyebrow="Attention" title="Needs action">
                        <ul className="attention-list">
                            <li>
                                <span className="attention-icon is-warning">12</span>
                                <div>
                                    <strong>Transfers awaiting receipt</strong>
                                    <small>Oldest pending for 2 days</small>
                                </div>
                                <IconButton icon="chevronRight" label="View pending transfers" />
                            </li>
                            <li>
                                <span className="attention-icon is-danger">6</span>
                                <div>
                                    <strong>Low stock products</strong>
                                    <small>Across 2 warehouses</small>
                                </div>
                                <IconButton icon="chevronRight" label="View low stock" />
                            </li>
                            <li>
                                <span className="attention-icon is-info">9</span>
                                <div>
                                    <strong>Cash submissions</strong>
                                    <small>4.2M MMK pending confirmation</small>
                                </div>
                                <IconButton icon="chevronRight" label="View cash submissions" />
                            </li>
                        </ul>
                    </Panel>

                    <Panel eyebrow="Shortcuts" title="Quick actions">
                        <div className="quick-actions">
                            <Button icon="transfer">Create transfer</Button>
                            <Button icon="adjustments">Stock adjustment</Button>
                            <Button icon="cash">Record payment</Button>
                            <Button icon="reports">Open reports</Button>
                        </div>
                    </Panel>
                </div>
            </div>

            <p className="foundation-note">
                <strong>UI foundation preview.</strong> Values are sample data and no transaction actions are connected
                yet.
            </p>
        </div>
    );
}
