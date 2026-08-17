import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import {
    financeApi,
    FinanceError,
    type CashSubmission,
    type CustomerCreditBalance,
    type CustomerPayment,
    type CustomerPaymentInput,
    type PaymentOptions,
    type RepresentativeCashBalance,
} from '../../services/finance';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

type Tab = 'cash' | 'credit' | 'payments';
const emptyOptions: PaymentOptions = {
    customers: [],
    warehouses: [],
    payment_methods: [],
};
const today = new Date().toISOString().slice(0, 10);
const emptyPayment = (): CustomerPaymentInput => ({
    customer_id: 0,
    amount: 0,
    payment_date: today,
    payment_method: 'cash',
    payment_reference: '',
    notes: '',
});
function money(value: number) {
    return `${new Intl.NumberFormat('en-US').format(value)} MMK`;
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
    return status === 'confirmed' || status === 'posted'
        ? 'success'
        : status === 'pending' || status === 'draft'
          ? 'warning'
          : status === 'reversed' || status === 'voided'
            ? 'danger'
            : 'neutral';
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load finance workspace.';
}

export function FinanceManagementPage() {
    const { user } = useSession();
    const superAdmin = Boolean(user?.roles.includes('super-admin'));
    const can = (permission: string) => superAdmin || Boolean(user?.permissions.includes(permission));
    const canCash = can('cash.view');
    const canPayments = can('customer_payment.view');
    const canConfirm = can('cash.confirm');
    const canReverse = can('cash.reverse');
    const canCreatePayment = can('customer_payment.create');
    const canVoidPayment = can('customer_payment.void');
    const [tab, setTab] = useState<Tab>(canCash ? 'cash' : 'credit');
    const [balances, setBalances] = useState<RepresentativeCashBalance[]>([]);
    const [submissions, setSubmissions] = useState<CashSubmission[]>([]);
    const [credit, setCredit] = useState<CustomerCreditBalance[]>([]);
    const [payments, setPayments] = useState<CustomerPayment[]>([]);
    const [options, setOptions] = useState(emptyOptions);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialog, setDialog] = useState(false);
    const [form, setForm] = useState(emptyPayment);
    const [fields, setFields] = useState<Record<string, string[]>>({});
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const cashRequests = canCash
                ? Promise.all([financeApi.cashBalances(), financeApi.cashSubmissions()])
                : Promise.resolve(null);
            const paymentRequests = canPayments
                ? Promise.all([financeApi.creditBalances(), financeApi.payments(), financeApi.paymentOptions()])
                : Promise.resolve(null);
            const [cashData, paymentData] = await Promise.all([cashRequests, paymentRequests]);
            if (cashData) {
                setBalances(cashData[0].data);
                setSubmissions(cashData[1].data);
            }
            if (paymentData) {
                setCredit(paymentData[0].data);
                setPayments(paymentData[1].data);
                setOptions(paymentData[2]);
            }
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [canCash, canPayments]);
    useEffect(() => {
        let active = true;
        const cashRequests = canCash
            ? Promise.all([financeApi.cashBalances(), financeApi.cashSubmissions()])
            : Promise.resolve(null);
        const paymentRequests = canPayments
            ? Promise.all([financeApi.creditBalances(), financeApi.payments(), financeApi.paymentOptions()])
            : Promise.resolve(null);
        void Promise.all([cashRequests, paymentRequests])
            .then(([cashData, paymentData]) => {
                if (!active) return;
                if (cashData) {
                    setBalances(cashData[0].data);
                    setSubmissions(cashData[1].data);
                }
                if (paymentData) {
                    setCredit(paymentData[0].data);
                    setPayments(paymentData[1].data);
                    setOptions(paymentData[2]);
                }
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
    }, [canCash, canPayments]);
    const act = async (id: number, operation: () => Promise<unknown>, success: string) => {
        setBusy(id);
        setError('');
        try {
            await operation();
            await load();
            setNotice(success);
            window.setTimeout(() => setNotice(''), 4500);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setBusy(null);
        }
    };
    const confirm = (row: CashSubmission) => {
        if (window.confirm(`Confirm receipt of ${money(row.amount)} for ${row.reference}?`))
            void act(
                row.id,
                () => financeApi.confirmSubmission(row.id),
                `${row.reference} confirmed and cash hold reduced.`,
            );
    };
    const reverseCash = (row: CashSubmission) => {
        const reason = window.prompt(`Reason for reversing ${row.reference}?`);
        if (reason?.trim())
            void act(
                row.id,
                () => financeApi.reverseSubmission(row.id, reason.trim()),
                `${row.reference} reversed with a linked ledger entry.`,
            );
    };
    const postPayment = (row: CustomerPayment) => {
        if (window.confirm(`Post ${money(row.amount)} for ${row.customer.name}?`))
            void act(row.id, () => financeApi.postPayment(row.id), `${row.reference} posted to customer credit.`);
    };
    const voidPayment = (row: CustomerPayment) => {
        const reason = window.prompt(`Reason for voiding ${row.reference}?`);
        if (reason?.trim())
            void act(
                row.id,
                () => financeApi.voidPayment(row.id, reason.trim()),
                `${row.reference} voided with a linked reversal.`,
            );
    };
    const openPayment = () => {
        const first = options.customers[0];
        setForm({
            ...emptyPayment(),
            customer_id: first?.id ?? 0,
            amount: first?.outstanding_amount ?? 0,
        });
        setFields({});
        setDialog(true);
    };
    const createPayment = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(-1);
        try {
            await financeApi.createPayment(form);
            setDialog(false);
            await load();
            setTab('payments');
            setNotice('Payment draft created. Review and post it to reduce outstanding credit.');
        } catch (requestError) {
            setFields(requestError instanceof FinanceError ? requestError.fields : {});
            setError(message(requestError));
        } finally {
            setBusy(null);
        }
    };
    const selectedCustomer = options.customers.find((customer) => customer.id === form.customer_id);
    const totals = useMemo(
        () => ({
            cash: balances.reduce((sum, row) => sum + row.cash_hold, 0),
            pending: balances.reduce((sum, row) => sum + row.pending_submissions, 0),
            credit: credit.reduce((sum, row) => sum + row.outstanding_amount, 0),
            draft: payments.filter((row) => row.status === 'draft').reduce((sum, row) => sum + row.amount, 0),
        }),
        [balances, credit, payments],
    );

    return (
        <div className="admin-page finance-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Settlement control</p>
                    <h1>Cash & credit</h1>
                    <p>
                        Confirm representative handovers, collect customer credit, and retain an append-only financial
                        trail.
                    </p>
                </div>
                {canCreatePayment ? (
                    <Button icon="plus" onClick={openPayment} tone="primary">
                        Record payment
                    </Button>
                ) : null}
            </header>
            <div className="metric-grid finance-metrics">
                <MetricCard hint="Assigned representatives" icon="cash" label="Cash held" value={money(totals.cash)} />
                <MetricCard
                    hint="Does not reduce hold"
                    icon="transfer"
                    label="Pending handover"
                    value={money(totals.pending)}
                />
                <MetricCard
                    hint="Assigned customers"
                    icon="customers"
                    label="Outstanding"
                    value={money(totals.credit)}
                />
                <MetricCard
                    hint="Neutral until posted"
                    icon="reports"
                    label="Payment drafts"
                    value={money(totals.draft)}
                />
            </div>
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
            <div className="finance-tabs" role="tablist">
                {canCash ? (
                    <button aria-selected={tab === 'cash'} onClick={() => setTab('cash')} role="tab">
                        Representative cash <span>{submissions.filter((row) => row.status === 'pending').length}</span>
                    </button>
                ) : null}
                {canPayments ? (
                    <button aria-selected={tab === 'credit'} onClick={() => setTab('credit')} role="tab">
                        Customer credit
                    </button>
                ) : null}
                {canPayments ? (
                    <button aria-selected={tab === 'payments'} onClick={() => setTab('payments')} role="tab">
                        Payments <span>{payments.filter((row) => row.status === 'draft').length}</span>
                    </button>
                ) : null}
            </div>
            {tab === 'cash' ? (
                <div className="finance-panel-grid">
                    <Panel eyebrow="Custody balances" title="Representative cash holds">
                        {loading ? (
                            <Loading />
                        ) : balances.length === 0 ? (
                            <EmptyState
                                description="Posted cash sales create representative holds."
                                title="No cash balances"
                            />
                        ) : (
                            <div className="ui-table-wrap">
                                <table className="ui-table">
                                    <thead>
                                        <tr>
                                            <th>Representative</th>
                                            <th>Warehouse</th>
                                            <th className="is-numeric">Hold</th>
                                            <th className="is-numeric">Pending</th>
                                            <th className="is-numeric">Available</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {balances.map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    <strong>{row.name}</strong>
                                                    <small>{row.code}</small>
                                                </td>
                                                <td>
                                                    {row.warehouse.name}
                                                    <small>{row.warehouse.code}</small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{money(row.cash_hold)}</strong>
                                                </td>
                                                <td className="is-numeric">{money(row.pending_submissions)}</td>
                                                <td className="is-numeric">{money(row.available_to_submit)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>
                    <Panel eyebrow="Office confirmation" title="Cash submissions">
                        {loading ? (
                            <Loading />
                        ) : submissions.length === 0 ? (
                            <EmptyState
                                description="Representative handovers appear here."
                                title="No cash submissions"
                            />
                        ) : (
                            <div className="ui-table-wrap">
                                <table className="ui-table">
                                    <thead>
                                        <tr>
                                            <th>Submission</th>
                                            <th>Representative</th>
                                            <th className="is-numeric">Amount</th>
                                            <th>Status</th>
                                            <th className="ui-table__actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {submissions.map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    <strong>{row.reference}</strong>
                                                    <small>{dateTime(row.created_at)}</small>
                                                </td>
                                                <td>
                                                    {row.representative.name}
                                                    <small>{row.warehouse.code}</small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{money(row.amount)}</strong>
                                                </td>
                                                <td>
                                                    <StatusBadge tone={tone(row.status)}>{row.status}</StatusBadge>
                                                </td>
                                                <td className="ui-table__actions">
                                                    {row.status === 'pending' && canConfirm ? (
                                                        <Button
                                                            disabled={busy === row.id}
                                                            onClick={() => confirm(row)}
                                                            requiresOnline
                                                            tone="primary"
                                                        >
                                                            Confirm
                                                        </Button>
                                                    ) : null}
                                                    {row.status === 'confirmed' && canReverse ? (
                                                        <Button
                                                            disabled={busy === row.id}
                                                            onClick={() => reverseCash(row)}
                                                            requiresOnline
                                                            tone="danger"
                                                        >
                                                            Reverse
                                                        </Button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>
                </div>
            ) : null}
            {tab === 'credit' ? (
                <Panel
                    actions={
                        canCreatePayment ? (
                            <Button icon="plus" onClick={openPayment} tone="primary">
                                Record payment
                            </Button>
                        ) : null
                    }
                    eyebrow="Receivables"
                    title="Customer outstanding credit"
                >
                    {loading ? (
                        <Loading />
                    ) : credit.length === 0 ? (
                        <EmptyState
                            description="Posted credit sales create customer outstanding balances."
                            title="No outstanding credit"
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Warehouse</th>
                                        <th>Status</th>
                                        <th className="is-numeric">Credit limit</th>
                                        <th className="is-numeric">Outstanding</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {credit.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                <strong>{row.name}</strong>
                                                <small>{row.code}</small>
                                            </td>
                                            <td>
                                                {row.warehouse.name}
                                                <small>{row.warehouse.code}</small>
                                            </td>
                                            <td>
                                                <StatusBadge tone={row.is_active ? 'success' : 'neutral'}>
                                                    {row.is_active ? 'active' : 'inactive'}
                                                </StatusBadge>
                                            </td>
                                            <td className="is-numeric">{money(row.credit_limit)}</td>
                                            <td className="is-numeric">
                                                <strong>{money(row.outstanding_amount)}</strong>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            ) : null}
            {tab === 'payments' ? (
                <Panel
                    actions={
                        canCreatePayment ? (
                            <Button icon="plus" onClick={openPayment} tone="primary">
                                New draft
                            </Button>
                        ) : null
                    }
                    eyebrow="Settlement register"
                    title="Customer payments"
                >
                    {loading ? (
                        <Loading />
                    ) : payments.length === 0 ? (
                        <EmptyState description="Record a received customer payment to begin." title="No payments" />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>Payment</th>
                                        <th>Customer</th>
                                        <th>Method / receiver</th>
                                        <th className="is-numeric">Amount</th>
                                        <th>Status</th>
                                        <th className="ui-table__actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                <strong>{row.reference}</strong>
                                                <small>
                                                    {row.payment_date} · {row.payment_reference || 'No external ref'}
                                                </small>
                                            </td>
                                            <td>
                                                {row.customer.name}
                                                <small>
                                                    {row.customer.code} · {row.warehouse.code}
                                                </small>
                                            </td>
                                            <td>
                                                {row.payment_method.replaceAll('_', ' ')}
                                                <small>{row.received_by?.name ?? '—'}</small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{money(row.amount)}</strong>
                                            </td>
                                            <td>
                                                <StatusBadge tone={tone(row.status)}>{row.status}</StatusBadge>
                                            </td>
                                            <td className="ui-table__actions">
                                                {row.status === 'draft' && canCreatePayment ? (
                                                    <Button
                                                        disabled={busy === row.id}
                                                        onClick={() => postPayment(row)}
                                                        requiresOnline
                                                        tone="primary"
                                                    >
                                                        Post
                                                    </Button>
                                                ) : null}
                                                {row.status === 'posted' && canVoidPayment ? (
                                                    <Button
                                                        disabled={busy === row.id}
                                                        onClick={() => voidPayment(row)}
                                                        requiresOnline
                                                        tone="danger"
                                                    >
                                                        Void
                                                    </Button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            ) : null}
            <Dialog
                description="Create a neutral draft first. Posting atomically reduces outstanding credit and rejects overpayment."
                footer={
                    <>
                        <Button disabled={busy === -1} onClick={() => setDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            disabled={busy === -1 || !form.customer_id || form.amount <= 0}
                            form="customer-payment-form"
                            requiresOnline
                            tone="primary"
                            type="submit"
                        >
                            {busy === -1 ? 'Saving…' : 'Save draft'}
                        </Button>
                    </>
                }
                onClose={() => setDialog(false)}
                open={dialog}
                title="Record customer payment"
                width="standard"
            >
                <form className="ui-form-grid" id="customer-payment-form" onSubmit={createPayment}>
                    <label className="ui-field ui-field--full">
                        <span>Customer</span>
                        <select
                            autoFocus
                            onChange={(event) => {
                                const customer = options.customers.find(
                                    (item) => item.id === Number(event.target.value),
                                );
                                setForm((value) => ({
                                    ...value,
                                    customer_id: customer?.id ?? 0,
                                    amount: customer?.outstanding_amount ?? 0,
                                }));
                            }}
                            required
                            value={form.customer_id}
                        >
                            <option value={0}>Select customer</option>
                            {options.customers.map((customer) => (
                                <option key={customer.id} value={customer.id}>
                                    {customer.code} · {customer.name} · {money(customer.outstanding_amount)}
                                </option>
                            ))}
                        </select>
                        {fields.customer_id?.[0] ? (
                            <small className="ui-field__error">{fields.customer_id[0]}</small>
                        ) : null}
                    </label>
                    <label className="ui-field">
                        <span>Amount (MMK)</span>
                        <input
                            max={selectedCustomer?.outstanding_amount}
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
                        {fields.amount?.[0] ? <small className="ui-field__error">{fields.amount[0]}</small> : null}
                    </label>
                    <label className="ui-field">
                        <span>Payment date</span>
                        <input
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    payment_date: event.target.value,
                                }))
                            }
                            required
                            type="date"
                            value={form.payment_date}
                        />
                    </label>
                    <label className="ui-field">
                        <span>Method</span>
                        <select
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    payment_method: event.target.value,
                                }))
                            }
                            value={form.payment_method}
                        >
                            {options.payment_methods.map((method) => (
                                <option key={method} value={method}>
                                    {method.replaceAll('_', ' ')}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="ui-field">
                        <span>External reference</span>
                        <input
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    payment_reference: event.target.value,
                                }))
                            }
                            placeholder="Bank, cheque, or receipt ref"
                            value={form.payment_reference}
                        />
                    </label>
                    <label className="ui-field ui-field--full">
                        <span>Notes</span>
                        <textarea
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    notes: event.target.value,
                                }))
                            }
                            rows={2}
                            value={form.notes}
                        />
                    </label>
                </form>
            </Dialog>
        </div>
    );
}

function Loading() {
    return (
        <div className="ui-loading">
            <span />
            Loading finance data…
        </div>
    );
}
