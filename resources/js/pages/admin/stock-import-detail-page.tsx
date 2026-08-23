import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { inventoryApi, type StockImport } from '../../services/inventory';
import { Icon } from '../../ui/icons';
import { Button, Dialog, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}

function money(value: number) {
    return `${number(value)} MMK`;
}

function dateTime(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : '—';
}

function statusTone(status: StockImport['status']) {
    return status === 'posted' ? 'success' : status === 'voided' ? 'danger' : 'warning';
}

function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load the stock import.';
}

export function StockImportDetailPage() {
    const { importId } = useParams();
    const navigate = useNavigate();
    const { user } = useSession();
    const id = Number(importId);
    const canImport = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('inventory.import'));
    const [record, setRecord] = useState<StockImport | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmPost, setConfirmPost] = useState(false);
    const [confirmVoid, setConfirmVoid] = useState(false);
    const [voidReason, setVoidReason] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError('Invalid stock import reference.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await inventoryApi.importRecord(id);
            setRecord(response.data);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        let active = true;
        if (!Number.isInteger(id) || id < 1) {
            queueMicrotask(() => {
                if (!active) return;
                setError('Invalid stock import reference.');
                setLoading(false);
            });
            return () => {
                active = false;
            };
        }
        void inventoryApi
            .importRecord(id)
            .then((response) => {
                if (!active) return;
                setRecord(response.data);
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(message(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id]);

    const totalValue = useMemo(
        () => record?.items.reduce((sum, item) => sum + item.quantity * item.product.selling_price, 0) ?? 0,
        [record],
    );

    const runCommand = async (operation: () => Promise<{ data: StockImport }>, success: string) => {
        setWorking(true);
        setError('');
        try {
            const response = await operation();
            setRecord(response.data);
            setNotice(success);
            setConfirmPost(false);
            setConfirmVoid(false);
            setVoidReason('');
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setWorking(false);
        }
    };

    if (loading && !record) {
        return (
            <div className="ui-loading" role="status">
                <span />
                Loading stock import…
            </div>
        );
    }

    if (!record) {
        return (
            <div className="admin-page stock-import-detail-page">
                <Link className="sale-detail-back" to="/admin/inventory">
                    <Icon name="chevronLeft" size={13} />
                    Inventory
                </Link>
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error || 'Stock import not found.'}
                    <button onClick={() => void load()} type="button">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page stock-import-detail-page">
            <header className="page-heading stock-import-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/inventory">
                        <Icon name="chevronLeft" size={13} />
                        Inventory imports
                    </Link>
                    <p className="ui-eyebrow">Stock import</p>
                    <h1>{record.reference}</h1>
                    <p>
                        {record.warehouse.name} · Created {dateTime(record.created_at)}
                    </p>
                </div>
                <div className="stock-import-detail-actions">
                    <StatusBadge tone={statusTone(record.status)}>{record.status}</StatusBadge>
                    {canImport && record.status === 'draft' ? (
                        <>
                            <Button icon="edit" onClick={() => navigate(`/admin/inventory/imports/${record.id}/edit`)}>
                                Edit draft
                            </Button>
                            <Button icon="check" onClick={() => setConfirmPost(true)} requiresOnline tone="primary">
                                Post import
                            </Button>
                        </>
                    ) : null}
                    {canImport && record.status === 'posted' ? (
                        <Button icon="reverse" onClick={() => setConfirmVoid(true)} requiresOnline tone="danger">
                            Void import
                        </Button>
                    ) : null}
                </div>
            </header>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="check" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()} type="button">
                        Retry
                    </button>
                </div>
            ) : null}

            <section aria-label="Import summary" className="metric-grid stock-import-detail-kpis">
                <MetricCard
                    hint="Distinct product lines"
                    icon="box"
                    label="Items"
                    value={number(record.items.length)}
                />
                <MetricCard
                    hint="Units received"
                    icon="warehouse"
                    label="Total quantity"
                    value={number(record.total_quantity)}
                />
                <MetricCard
                    hint="At current selling prices"
                    icon="cash"
                    label="Retail value"
                    value={money(totalValue)}
                />
            </section>

            <div className="stock-import-detail-grid">
                <Panel className="stock-import-items" eyebrow="Import contents" title="Product lines">
                    <div className="ui-table-wrap">
                        <table className="ui-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Unit</th>
                                    <th className="is-numeric">Quantity</th>
                                    <th className="is-numeric">Selling price</th>
                                    <th className="is-numeric">Line value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {record.items.map((item) => (
                                    <tr key={item.id ?? item.product.id}>
                                        <td>
                                            <strong>{item.product.name}</strong>
                                            <small>{item.product.sku}</small>
                                        </td>
                                        <td>{item.product.unit}</td>
                                        <td className="is-numeric">
                                            <strong>{number(item.quantity)}</strong>
                                        </td>
                                        <td className="is-numeric">{money(item.product.selling_price)}</td>
                                        <td className="is-numeric">
                                            <strong>{money(item.quantity * item.product.selling_price)}</strong>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={2}>Total</td>
                                    <td className="is-numeric">
                                        <strong>{number(record.total_quantity)}</strong>
                                    </td>
                                    <td />
                                    <td className="is-numeric">
                                        <strong>{money(totalValue)}</strong>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Panel>

                <div className="stock-import-detail-side">
                    <Panel eyebrow="Document" title="Import details">
                        <dl className="stock-import-detail-facts">
                            <div>
                                <dt>Warehouse</dt>
                                <dd>
                                    {record.warehouse.name}
                                    <small>{record.warehouse.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>Created by</dt>
                                <dd>
                                    {record.created_by.name}
                                    <small>{dateTime(record.created_at)}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>Posted by</dt>
                                <dd>
                                    {record.posted_by?.name ?? 'Not posted'}
                                    <small>{dateTime(record.posted_at)}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>Voided by</dt>
                                <dd>
                                    {record.voided_by?.name ?? 'Not voided'}
                                    <small>{dateTime(record.voided_at)}</small>
                                </dd>
                            </div>
                            <div className="is-wide">
                                <dt>Notes</dt>
                                <dd>{record.notes || 'No notes recorded'}</dd>
                            </div>
                            {record.void_reason ? (
                                <div className="is-wide is-danger">
                                    <dt>Void reason</dt>
                                    <dd>{record.void_reason}</dd>
                                </div>
                            ) : null}
                        </dl>
                    </Panel>
                </div>
            </div>

            <Dialog
                description="Posting adds all quantities to warehouse stock and makes this import immutable."
                footer={
                    <>
                        <Button disabled={working} onClick={() => setConfirmPost(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={working}
                            onClick={() =>
                                void runCommand(
                                    () => inventoryApi.postImport(record.id),
                                    `${record.reference} posted successfully.`,
                                )
                            }
                            requiresOnline
                            tone="primary"
                        >
                            {working ? 'Posting…' : 'Post import'}
                        </Button>
                    </>
                }
                onClose={() => setConfirmPost(false)}
                open={confirmPost}
                title="Post this stock import?"
                width="compact"
            >
                <p className="stock-import-confirm-summary">
                    <strong>{number(record.total_quantity)} units</strong> across {record.items.length} product lines
                    will be added to {record.warehouse.name}.
                </p>
            </Dialog>

            <Dialog
                description="Voiding reverses the posted inventory movement. This action is recorded in the audit trail."
                footer={
                    <>
                        <Button disabled={working} onClick={() => setConfirmVoid(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={working || !voidReason.trim()}
                            onClick={() =>
                                void runCommand(
                                    () => inventoryApi.voidImport(record.id, voidReason.trim()),
                                    `${record.reference} voided successfully.`,
                                )
                            }
                            requiresOnline
                            tone="danger"
                        >
                            {working ? 'Voiding…' : 'Void import'}
                        </Button>
                    </>
                }
                onClose={() => setConfirmVoid(false)}
                open={confirmVoid}
                title="Void this stock import?"
                width="compact"
            >
                <label className="ui-field">
                    <span>Reason</span>
                    <textarea
                        autoFocus
                        maxLength={500}
                        onChange={(event) => setVoidReason(event.target.value)}
                        placeholder="Explain why this import must be reversed"
                        rows={4}
                        value={voidReason}
                    />
                </label>
            </Dialog>
        </div>
    );
}
