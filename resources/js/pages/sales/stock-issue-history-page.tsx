import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { transferApi, type RepresentativeTransfer, type TransferStatus } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { EmptyState, Pagination, StatusBadge } from '../../ui/primitives';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 10,
    to: null,
    total: 0,
};
const dateTime = (value: string | null) =>
    value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : '—';
const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unable to load stock issue history.';
const tone = (status: TransferStatus) => (status === 'received' ? 'success' : 'danger');

export function StockIssueHistoryPage() {
    const [records, setRecords] = useState<RepresentativeTransfer[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError('');
        void transferApi
            .ownReceivingHistory(page)
            .then((response) => {
                if (!active) return;
                setRecords(response.data);
                setMeta(response.meta);
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [page]);

    return (
        <div className="sales-stock-page stock-issue-history-page">
            <header className="sales-page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/sales/my-stock">
                        <Icon name="chevronLeft" size={13} />
                        My stock
                    </Link>
                    <p className="ui-eyebrow">Inventory custody</p>
                    <h1>Stock issue history</h1>
                    <p>Review stock previously issued to your representative inventory.</p>
                </div>
                <StatusBadge tone="neutral">{meta.total} records</StatusBadge>
            </header>

            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                </div>
            ) : null}

            <section className="sales-section sales-receiving-list">
                <header>
                    <div>
                        <p className="ui-eyebrow">Stock issues</p>
                        <h2>Completed issues</h2>
                    </div>
                </header>
                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        Loading issue history…
                    </div>
                ) : records.length === 0 ? (
                    <EmptyState description="Received stock issues will appear here." title="No issue history" />
                ) : (
                    <div className="sales-receiving-notifications">
                        {records.map((transfer) => (
                            <Link
                                aria-label={`View stock issue ${transfer.reference}`}
                                className="sales-receiving-notification"
                                key={transfer.id}
                                to={`/sales/receivings/${transfer.id}`}
                            >
                                <span className="sales-stock-list__icon">
                                    <Icon name="box" size={17} />
                                </span>
                                <div className="sales-receiving-notification__copy">
                                    <strong>{transfer.reference}</strong>
                                    <small>{transfer.source_warehouse.name}</small>
                                    <span>
                                        {transfer.items.length} products · {transfer.total_quantity} units ·{' '}
                                        {dateTime(transfer.received_at ?? transfer.reversed_at)}
                                    </span>
                                </div>
                                <StatusBadge tone={tone(transfer.status)}>{transfer.status}</StatusBadge>
                                <span className="sales-receiving-notification__chevron" aria-hidden="true">
                                    <Icon name="chevronRight" size={16} />
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
                <Pagination label="Stock issue history" loading={loading} meta={meta} onPageChange={setPage} />
            </section>
        </div>
    );
}
