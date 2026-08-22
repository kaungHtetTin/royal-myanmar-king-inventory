import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { financeApi, FinanceError, type CashOverview, type CashSubmission } from '../../services/finance';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, StatusBadge } from '../../ui/primitives';

const emptyOverview: CashOverview = {
    representative: { id: 0, code: '', name: '' },
    cash_hold: 0,
    pending_submissions: 0,
    available_to_submit: 0,
    transactions: [],
};
function money(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}
function dateTime(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';
}
function tone(status: string) {
    return status === 'confirmed'
        ? 'success'
        : status === 'pending'
          ? 'warning'
          : status === 'reversed'
            ? 'danger'
            : 'neutral';
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load cash hold.';
}

export function CashWorkspacePage() {
    const [overview, setOverview] = useState(emptyOverview);
    const [submissions, setSubmissions] = useState<CashSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialog, setDialog] = useState(false);
    const [form, setForm] = useState({ amount: 0, notes: '' });
    const [fields, setFields] = useState<Record<string, string[]>>({});
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [cash, list] = await Promise.all([financeApi.ownOverview(), financeApi.ownSubmissions()]);
            setOverview(cash);
            setSubmissions(list.data);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        let active = true;
        void Promise.all([financeApi.ownOverview(), financeApi.ownSubmissions()])
            .then(([cash, list]) => {
                if (!active) return;
                setOverview(cash);
                setSubmissions(list.data);
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
    }, []);
    const open = () => {
        setForm({ amount: overview.available_to_submit, notes: '' });
        setFields({});
        setDialog(true);
    };
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            await financeApi.submitCash(form);
            setDialog(false);
            await load();
            setNotice('Cash submission is pending office confirmation.');
            window.setTimeout(() => setNotice(''), 4500);
        } catch (requestError) {
            setFields(requestError instanceof FinanceError ? requestError.fields : {});
            setError(message(requestError));
        } finally {
            setSaving(false);
        }
    };
    const cancel = async (submission: CashSubmission) => {
        const reason = window.prompt(`Why are you cancelling ${submission.reference}?`);
        if (!reason?.trim()) return;
        setSaving(true);
        try {
            await financeApi.cancelSubmission(submission.id, reason.trim());
            await load();
            setNotice(`${submission.reference} cancelled. Cash hold was unchanged.`);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setSaving(false);
        }
    };
    const confirmed = useMemo(
        () => submissions.filter((row) => row.status === 'confirmed').reduce((sum, row) => sum + row.amount, 0),
        [submissions],
    );

    return (
        <div className="sales-cash-page">
            <header className="sales-page-heading">
                <div>
                    <p>Financial custody</p>
                    <h1>Cash hold</h1>
                </div>
                <IconButton
                    disabled={loading || overview.available_to_submit <= 0}
                    icon="plus"
                    label="Submit cash"
                    onClick={open}
                    tone="primary"
                />
            </header>
            <section aria-label="Cash hold summary" className="sales-summary-grid sales-cash-summary">
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="cash" size={18} />
                    </span>
                    <small>Current hold</small>
                    <strong>{money(overview.cash_hold)}</strong>
                    <p>MMK in your custody</p>
                </article>
                <article className="sales-summary-card cash-pending-card">
                    <span>
                        <Icon name="transfer" size={18} />
                    </span>
                    <small>Pending</small>
                    <strong>{money(overview.pending_submissions)}</strong>
                    <p>Declared, awaiting office</p>
                </article>
                <article className="sales-summary-card cash-available-card">
                    <span>
                        <Icon name="sales" size={18} />
                    </span>
                    <small>Available</small>
                    <strong>{money(overview.available_to_submit)}</strong>
                    <p>MMK you can submit</p>
                </article>
            </section>
            {notice ? (
                <div className="ui-flash ui-flash--success">
                    <Icon name="cash" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}
            <div className="sales-cash-grid">
                <section className="sales-section cash-submissions-panel">
                    <header>
                        <div>
                            <p className="ui-eyebrow">Office handovers</p>
                            <h2>Cash submissions</h2>
                        </div>
                        <small>{money(confirmed)} MMK confirmed</small>
                    </header>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            Loading submissions…
                        </div>
                    ) : submissions.length === 0 ? (
                        <EmptyState
                            description="Declare a handover after giving cash to the office."
                            title="No submissions yet"
                        />
                    ) : (
                        <div className="cash-card-list">
                            {submissions.map((row) => (
                                <article key={row.id}>
                                    <div className="cash-card-list__identity">
                                        <span>
                                            <Icon name="cash" size={16} />
                                        </span>
                                        <div>
                                            <strong>{row.reference}</strong>
                                            <small>{dateTime(row.created_at)}</small>
                                        </div>
                                    </div>
                                    <div className="cash-card-list__details">
                                        <StatusBadge tone={tone(row.status)}>{row.status}</StatusBadge>
                                        <strong className="cash-card-list__amount">
                                            {money(row.amount)} <small>MMK</small>
                                        </strong>
                                        {row.status === 'pending' ? (
                                            <IconButton
                                                disabled={saving}
                                                icon="x"
                                                label={`Cancel ${row.reference}`}
                                                onClick={() => void cancel(row)}
                                                requiresOnline
                                                tone="danger"
                                            />
                                        ) : null}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
                <section className="sales-section cash-activity-panel">
                    <header>
                        <div>
                            <p className="ui-eyebrow">Append-only ledger</p>
                            <h2>Cash activity</h2>
                        </div>
                        <small>Last {overview.transactions.length}</small>
                    </header>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            Loading activity…
                        </div>
                    ) : overview.transactions.length === 0 ? (
                        <EmptyState
                            description="Posted cash sales and office confirmations appear here."
                            title="No cash activity"
                        />
                    ) : (
                        <div className="cash-ledger-list">
                            {overview.transactions.map((row) => (
                                <article key={row.id}>
                                    <span className={row.amount_delta >= 0 ? 'is-in' : 'is-out'}>
                                        {row.amount_delta >= 0 ? '+' : '−'}
                                    </span>
                                    <div>
                                        <strong>{row.reference}</strong>
                                        <small>
                                            {row.type.replaceAll('_', ' ')} · {dateTime(row.occurred_at)}
                                        </small>
                                    </div>
                                    <b className={row.amount_delta >= 0 ? 'is-positive' : 'is-negative'}>
                                        {row.amount_delta >= 0 ? '+' : '−'}
                                        {money(Math.abs(row.amount_delta))}
                                    </b>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
            <Dialog
                description={`Available to submit: ${money(overview.available_to_submit)} MMK. Your hold changes only after office confirmation.`}
                footer={
                    <>
                        <Button disabled={saving} onClick={() => setDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={saving || form.amount <= 0}
                            form="cash-submission-form"
                            requiresOnline
                            tone="primary"
                            type="submit"
                        >
                            {saving ? 'Submitting…' : 'Submit for confirmation'}
                        </Button>
                    </>
                }
                onClose={() => setDialog(false)}
                open={dialog}
                title="Submit cash"
                width="compact"
            >
                <form className="ui-form-grid" id="cash-submission-form" onSubmit={submit}>
                    <label className="ui-field ui-field--full">
                        <span>Amount (MMK)</span>
                        <input
                            autoFocus
                            max={overview.available_to_submit}
                            min={1}
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    amount: Number(event.target.value),
                                }))
                            }
                            required
                            type="number"
                            value={form.amount}
                        />
                        {fields.amount?.[0] ? (
                            <small className="ui-field__error">{fields.amount[0]}</small>
                        ) : (
                            <small>Pending submissions reserve the available amount.</small>
                        )}
                    </label>
                    <label className="ui-field ui-field--full">
                        <span>Handover note</span>
                        <textarea
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    notes: event.target.value,
                                }))
                            }
                            placeholder="Cashier, envelope, or handover detail"
                            rows={3}
                            value={form.notes}
                        />
                    </label>
                </form>
            </Dialog>
        </div>
    );
}
