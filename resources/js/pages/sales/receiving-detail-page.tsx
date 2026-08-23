import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { transferApi, type RepresentativeTransfer } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { Button, Dialog, StatusBadge } from '../../ui/primitives';

const dateTime = (value: string | null) =>
    value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : '—';
const message = (error: unknown) => (error instanceof Error ? error.message : 'Unable to load this receiving.');

export function ReceivingDetailPage() {
    const { transferId } = useParams();
    const navigate = useNavigate();
    const id = Number(transferId);
    const [transfer, setTransfer] = useState<RepresentativeTransfer | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [approveOpen, setApproveOpen] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setTransfer((await transferApi.ownReceiving(id)).data);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [id]);
    useEffect(() => {
        let active = true;
        void transferApi
            .ownReceiving(id)
            .then((response) => {
                if (active) setTransfer(response.data);
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
    const submit = async () => {
        if (!transfer) return;
        setWorking(true);
        setError('');
        try {
            await transferApi.receiveOwn(transfer.id);
            navigate('/sales/dashboard');
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setWorking(false);
        }
    };
    if (loading && !transfer)
        return (
            <div className="ui-loading" role="status">
                <span />
                Loading receiving…
            </div>
        );
    if (!transfer)
        return (
            <div className="receiving-detail-page">
                <Link className="sale-detail-back" to="/sales/dashboard">
                    <Icon name="chevronLeft" size={13} />
                    Dashboard
                </Link>
                <div className="ui-flash ui-flash--danger">
                    {error || 'Receiving not found.'}
                    <button onClick={() => void load()} type="button">
                        Retry
                    </button>
                </div>
            </div>
        );
    const isPending = transfer.status === 'dispatched';
    const backPath = isPending ? '/sales/my-stock' : '/sales/stock-issue-history';
    const statusTone = transfer.status === 'received' ? 'success' : transfer.status === 'reversed' ? 'danger' : 'info';
    return (
        <div className="receiving-detail-page">
            <header className="sales-page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to={backPath}>
                        <Icon name="chevronLeft" size={13} />
                        {isPending ? 'Pending stock' : 'Stock issue history'}
                    </Link>
                    <p className="ui-eyebrow">Stock receiving</p>
                    <h1>{transfer.reference}</h1>
                    <p>
                        {transfer.source_warehouse.name} · Dispatched {dateTime(transfer.dispatched_at)}
                    </p>
                </div>
                <StatusBadge tone={statusTone}>
                    {transfer.status === 'received'
                        ? 'Received'
                        : transfer.status === 'reversed'
                          ? 'Reversed'
                          : 'In transit'}
                </StatusBadge>
            </header>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                </div>
            ) : null}
            <section className="sales-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">Shipment contents</p>
                        <h2>
                            {transfer.items.length} products · {transfer.total_quantity} units
                        </h2>
                    </div>
                </header>
                <div className="receiving-detail-items">
                    {transfer.items.map((item) => (
                        <div key={item.id ?? item.product.id}>
                            <span>
                                <strong>{item.product.name}</strong>
                                <small>
                                    {item.product.sku} · {item.product.unit}
                                </small>
                            </span>
                            <strong>{item.quantity}</strong>
                        </div>
                    ))}
                </div>
            </section>
            {isPending ? (
                <div className="stock-import-form-page__actions">
                    <Button icon="check" onClick={() => setApproveOpen(true)} requiresOnline tone="primary">
                        Approve receipt
                    </Button>
                </div>
            ) : null}
            <Dialog
                description="Confirm that every listed quantity was received. Stock will be added to your inventory."
                footer={
                    <>
                        <Button disabled={working} onClick={() => setApproveOpen(false)}>
                            Go back
                        </Button>
                        <Button disabled={working} onClick={() => void submit()} requiresOnline tone="primary">
                            {working ? 'Working…' : 'Approve all received'}
                        </Button>
                    </>
                }
                onClose={() => setApproveOpen(false)}
                open={approveOpen}
                title={`Approve ${transfer.reference}?`}
                width="compact"
            >
                <p>
                    Approve {transfer.total_quantity} units from {transfer.source_warehouse.name}.
                </p>
            </Dialog>
        </div>
    );
}
