import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
import { editableNumber } from '../../ui/form-values';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

type Tab = 'cash-holds' | 'cash-submissions' | 'credit' | 'payments';
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
const emptyListFilters = { cash_warehouse_id: 0, submission_search: '', credit_search: '', payment_search: '' };
function tone(status: string) {
    return status === 'confirmed' || status === 'posted'
        ? 'success'
        : status === 'pending' || status === 'draft'
          ? 'warning'
          : status === 'reversed' || status === 'voided'
            ? 'danger'
            : 'neutral';
}
function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function FinanceManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('—'));
    const { user } = useSession();
    const superAdmin = Boolean(user?.roles.includes('super-admin'));
    const can = (permission: string) => superAdmin || Boolean(user?.permissions.includes(permission));
    const canCash = can('cash.view');
    const canPayments = can('customer_payment.view');
    const canConfirm = can('cash.confirm');
    const canReverse = can('cash.reverse');
    const canCreatePayment = can('customer_payment.create');
    const canVoidPayment = can('customer_payment.void');
    const [tab, setTab] = useState<Tab>(canCash ? 'cash-holds' : 'credit');
    const [balances, setBalances] = useState<RepresentativeCashBalance[]>([]);
    const [submissions, setSubmissions] = useState<CashSubmission[]>([]);
    const [credit, setCredit] = useState<CustomerCreditBalance[]>([]);
    const [payments, setPayments] = useState<CustomerPayment[]>([]);
    const [totals, setTotals] = useState({ cash: 0, credit: 0, draft: 0, pending: 0 });
    const [options, setOptions] = useState(emptyOptions);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialog, setDialog] = useState(false);
    const [cashDialog, setCashDialog] = useState(false);
    const [cashForm, setCashForm] = useState({ sales_representative_id: 0, amount: 0, notes: '' });
    const [cashFields, setCashFields] = useState<Record<string, string[]>>({});
    const [form, setForm] = useState(emptyPayment);
    const [fields, setFields] = useState<Record<string, string[]>>({});
    const [listFilters, setListFilters] = useState(emptyListFilters);
    const [listDraft, setListDraft] = useState(emptyListFilters);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const cashRequests = canCash
                ? Promise.all([
                    financeApi.cashBalances({ warehouse_id: listFilters.cash_warehouse_id || undefined }),
                    financeApi.cashSubmissions({ search: listFilters.submission_search || undefined }),
                ])
                : Promise.resolve(null);
            const paymentRequests = canPayments
                ? Promise.all([
                    financeApi.creditBalances({ search: listFilters.credit_search || undefined }),
                    financeApi.payments({ search: listFilters.payment_search || undefined }),
                    financeApi.paymentOptions(),
                ])
                : Promise.resolve(null);
            const [cashData, paymentData] = await Promise.all([cashRequests, paymentRequests]);
            if (cashData) {
                setBalances(cashData[0].data);
                setSubmissions(cashData[1].data);
                setTotals((value) => ({
                    ...value,
                    cash: cashData[0].summary?.cash_held ?? 0,
                    pending: cashData[0].summary?.pending_handover ?? 0,
                }));
            }
            if (paymentData) {
                setCredit(paymentData[0].data);
                setPayments(paymentData[1].data);
                setOptions(paymentData[2]);
                setTotals((value) => ({
                    ...value,
                    credit: paymentData[0].summary?.outstanding ?? 0,
                    draft: paymentData[1].summary?.draft_amount ?? 0,
                }));
            }
        } catch (requestError) {
            setError(message(requestError, t('Unable to load finance workspace.')));
        } finally {
            setLoading(false);
        }
    }, [canCash, canPayments, listFilters, t]);
    useEffect(() => {
        let active = true;
        const cashRequests = canCash
            ? Promise.all([
                financeApi.cashBalances({ warehouse_id: listFilters.cash_warehouse_id || undefined }),
                financeApi.cashSubmissions({ search: listFilters.submission_search || undefined }),
            ])
            : Promise.resolve(null);
        const paymentRequests = canPayments
            ? Promise.all([
                financeApi.creditBalances({ search: listFilters.credit_search || undefined }),
                financeApi.payments({ search: listFilters.payment_search || undefined }),
                financeApi.paymentOptions(),
            ])
            : Promise.resolve(null);
        void Promise.all([cashRequests, paymentRequests])
            .then(([cashData, paymentData]) => {
                if (!active) return;
                if (cashData) {
                    setBalances(cashData[0].data);
                    setSubmissions(cashData[1].data);
                    setTotals((value) => ({
                        ...value,
                        cash: cashData[0].summary?.cash_held ?? 0,
                        pending: cashData[0].summary?.pending_handover ?? 0,
                    }));
                }
                if (paymentData) {
                    setCredit(paymentData[0].data);
                    setPayments(paymentData[1].data);
                    setOptions(paymentData[2]);
                    setTotals((value) => ({
                        ...value,
                        credit: paymentData[0].summary?.outstanding ?? 0,
                        draft: paymentData[1].summary?.draft_amount ?? 0,
                    }));
                }
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load finance workspace.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [canCash, canPayments, listFilters, t]);
    const act = async (id: number, operation: () => Promise<unknown>, success: string) => {
        setBusy(id);
        setError('');
        try {
            await operation();
            await load();
            setNotice(success);
            window.setTimeout(() => setNotice(''), 4500);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load finance workspace.')));
        } finally {
            setBusy(null);
        }
    };
    const confirm = (row: CashSubmission) => {
        if (
            window.confirm(
                t('Confirm receipt of {amount} for {reference}?', {
                    amount: money(row.amount),
                    reference: row.reference,
                }),
            )
        )
            void act(
                row.id,
                () => financeApi.confirmSubmission(row.id),
                t('{reference} confirmed and cash hold reduced.', { reference: row.reference }),
            );
    };
    const reverseCash = (row: CashSubmission) => {
        const reason = window.prompt(t('Reason for reversing {reference}?', { reference: row.reference }));
        if (reason?.trim())
            void act(
                row.id,
                () => financeApi.reverseSubmission(row.id, reason.trim()),
                t('{reference} reversed with a linked ledger entry.', { reference: row.reference }),
            );
    };
    const postPayment = (row: CustomerPayment) => {
        if (
            window.confirm(
                t('Post {amount} for {customer}?', { amount: money(row.amount), customer: row.customer.name }),
            )
        )
            void act(
                row.id,
                () => financeApi.postPayment(row.id),
                t('{reference} posted to customer credit.', { reference: row.reference }),
            );
    };
    const voidPayment = (row: CustomerPayment) => {
        const reason = window.prompt(t('Reason for voiding {reference}?', { reference: row.reference }));
        if (reason?.trim())
            void act(
                row.id,
                () => financeApi.voidPayment(row.id, reason.trim()),
                t('{reference} voided with a linked reversal.', { reference: row.reference }),
            );
    };
    const openPayment = () => {
        const first = options.customers[0];
        setForm({
            ...emptyPayment(),
            customer_id: first?.id ?? 0,
            amount: first?.outstanding_amount ?? 0,
            payment_method: options.payment_methods[0]?.key ?? 'cash',
        });
        setFields({});
        setDialog(true);
    };
    const openCashCollection = (representative?: RepresentativeCashBalance) => {
        const selected = representative ?? balances.find((row) => row.available_to_submit > 0);
        setCashForm({ sales_representative_id: selected?.id ?? 0, amount: selected?.available_to_submit ?? 0, notes: '' });
        setCashFields({});
        setCashDialog(true);
    };
    const collectCash = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(-2);
        setError('');
        try {
            const response = await financeApi.collectCash(cashForm);
            setCashDialog(false);
            await load();
            setTab('cash-submissions');
            setNotice(t('{reference} collected and confirmed outside a trip.', { reference: response.data.reference }));
        } catch (requestError) {
            setCashFields(requestError instanceof FinanceError ? requestError.fields : {});
            setError(message(requestError, t('Unable to collect representative cash.')));
        } finally {
            setBusy(null);
        }
    };
    const createPayment = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(-1);
        try {
            await financeApi.createPayment(form);
            setDialog(false);
            await load();
            setTab('payments');
            setNotice(t('Payment draft created. Review and post it to reduce outstanding credit.'));
        } catch (requestError) {
            setFields(requestError instanceof FinanceError ? requestError.fields : {});
            setError(message(requestError, t('Unable to load finance workspace.')));
        } finally {
            setBusy(null);
        }
    };
    const selectedCustomer = options.customers.find((customer) => customer.id === form.customer_id);
    const applyListFilters = (event: FormEvent) => {
        event.preventDefault();
        setListFilters(listDraft);
    };
    return (
        <div className="admin-page finance-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Settlement control')}</p>
                    <h1>{t('Cash & credit')}</h1>
                    <p>
                        {t(
                            'Confirm representative handovers, collect customer credit, and retain an append-only financial trail.',
                        )}
                    </p>
                </div>
                <div className="page-heading__actions">
                    {canConfirm ? <Button icon="cash" onClick={() => openCashCollection()} tone="primary">{t('Collect cash')}</Button> : null}
                    {canCreatePayment ? <Button icon="plus" onClick={openPayment} tone="primary">{t('Record payment')}</Button> : null}
                </div>
            </header>
            <div className="metric-grid finance-metrics">
                <MetricCard
                    hint={t('Assigned representatives')}
                    icon="cash"
                    label={t('Cash held')}
                    value={money(totals.cash)}
                />
                <MetricCard
                    hint={t('Does not reduce hold')}
                    icon="transfer"
                    label={t('Pending handover')}
                    value={money(totals.pending)}
                />
                <MetricCard
                    hint={t('Assigned customers')}
                    icon="customers"
                    label={t('Outstanding')}
                    value={money(totals.credit)}
                />
                <MetricCard
                    hint={t('Neutral until posted')}
                    icon="reports"
                    label={t('Payment drafts')}
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
                    <button onClick={() => void load()}>{t('Retry')}</button>
                </div>
            ) : null}
            <div
                className={`section-tabs section-tabs--${Number(canCash) * 2 + (canPayments ? 2 : 0)} finance-tabs`}
                role="tablist"
            >
                {canCash ? (
                    <button
                        aria-selected={tab === 'cash-holds'}
                        onClick={() => setTab('cash-holds')}
                        role="tab"
                        type="button"
                    >
                        <Icon name="cash" size={15} />
                        <span>{t('Cash holds')}</span>
                        <span className="section-tab-count">{formatNumber(balances.length)}</span>
                    </button>
                ) : null}
                {canCash ? (
                    <button
                        aria-selected={tab === 'cash-submissions'}
                        onClick={() => setTab('cash-submissions')}
                        role="tab"
                        type="button"
                    >
                        <Icon name="transfer" size={15} />
                        <span>{t('Cash submissions')}</span>
                        <span className="section-tab-count">
                            {submissions.filter((row) => row.status === 'pending').length}
                        </span>
                    </button>
                ) : null}
                {canPayments ? (
                    <button aria-selected={tab === 'credit'} onClick={() => setTab('credit')} role="tab" type="button">
                        <Icon name="customers" size={15} />
                        <span>{t('Customer credit')}</span>
                    </button>
                ) : null}
                {canPayments ? (
                    <button
                        aria-selected={tab === 'payments'}
                        onClick={() => setTab('payments')}
                        role="tab"
                        type="button"
                    >
                        <Icon name="reports" size={15} />
                        <span>{t('Payments')}</span>
                        <span className="section-tab-count">
                            {payments.filter((row) => row.status === 'draft').length}
                        </span>
                    </button>
                ) : null}
            </div>
            {tab === 'cash-holds' ? (
                <Panel eyebrow={t('Custody balances')} title={t('Representative cash holds')}>
                    <form className="filter-toolbar finance-tab-filter" onSubmit={applyListFilters}>
                        <label className="filter-field"><span>{t('Warehouse')}</span><select onChange={(event) => setListDraft((value) => ({ ...value, cash_warehouse_id: Number(event.target.value) }))} value={listDraft.cash_warehouse_id}><option value={0}>{t('All warehouses')}</option>{options.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
                        <Button icon="search" type="submit">{t('Apply')}</Button>
                    </form>
                    {loading ? (
                        <Loading />
                    ) : balances.length === 0 ? (
                        <EmptyState
                            description={t('Posted cash sales create representative holds.')}
                            title={t('No cash balances')}
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>{t('Representative')}</th>
                                        <th>{t('Warehouse')}</th>
                                        <th className="is-numeric">{t('Hold')}</th>
                                        <th className="is-numeric">{t('Pending')}</th>
                                        <th className="is-numeric">{t('Available')}</th>
                                        {canConfirm ? <th className="ui-table__actions">{t('Actions')}</th> : null}
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
                                            {canConfirm ? (
                                                <td className="ui-table__actions">
                                                    <IconButton
                                                        disabled={row.available_to_submit <= 0}
                                                        icon="cash"
                                                        label={t('Collect cash from {representative}', { representative: row.name })}
                                                        onClick={() => openCashCollection(row)}
                                                        requiresOnline
                                                        tone="primary"
                                                    />
                                                </td>
                                            ) : null}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
            ) : null}
            {tab === 'cash-submissions' ? (
                <Panel eyebrow={t('Office confirmation')} title={t('Cash submissions')}>
                    <form className="filter-toolbar finance-tab-filter" onSubmit={applyListFilters}>
                        <label className="filter-search"><Icon name="search" size={15} /><input aria-label={t('Search cash submissions')} onChange={(event) => setListDraft((value) => ({ ...value, submission_search: event.target.value }))} placeholder={t('Submission ID or representative name')} type="search" value={listDraft.submission_search} /></label>
                        <Button icon="search" type="submit">{t('Search')}</Button>
                    </form>
                    {loading ? (
                        <Loading />
                    ) : submissions.length === 0 ? (
                        <EmptyState
                            description={t('Representative handovers appear here.')}
                            title={t('No cash submissions')}
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>{t('Submission')}</th>
                                        <th>{t('Representative')}</th>
                                        <th className="is-numeric">{t('Amount')}</th>
                                        <th>{t('Status')}</th>
                                        <th className="ui-table__actions">{t('Actions')}</th>
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
                                                <StatusBadge tone={tone(row.status)}>{t(row.status)}</StatusBadge>
                                            </td>
                                            <td className="ui-table__actions">
                                                {row.status === 'pending' && canConfirm ? (
                                                    <IconButton
                                                        disabled={busy === row.id}
                                                        icon="check"
                                                        label={t('Confirm {reference}', { reference: row.reference })}
                                                        onClick={() => confirm(row)}
                                                        requiresOnline
                                                        tone="primary"
                                                    />
                                                ) : null}
                                                {row.status === 'confirmed' && canReverse ? (
                                                    <IconButton
                                                        disabled={busy === row.id}
                                                        icon="reverse"
                                                        label={t('Reverse {reference}', { reference: row.reference })}
                                                        onClick={() => reverseCash(row)}
                                                        requiresOnline
                                                        tone="danger"
                                                    />
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
            {tab === 'credit' ? (
                <Panel
                    actions={
                        canCreatePayment ? (
                            <Button icon="plus" onClick={openPayment} tone="primary">
                                {t('Record payment')}
                            </Button>
                        ) : null
                    }
                    eyebrow={t('Receivables')}
                    title={t('Customer outstanding credit')}
                >
                    <form className="filter-toolbar finance-tab-filter" onSubmit={applyListFilters}>
                        <label className="filter-search"><Icon name="search" size={15} /><input aria-label={t('Search customer credit')} onChange={(event) => setListDraft((value) => ({ ...value, credit_search: event.target.value }))} placeholder={t('Customer code or name')} type="search" value={listDraft.credit_search} /></label>
                        <Button icon="search" type="submit">{t('Search')}</Button>
                    </form>
                    {loading ? (
                        <Loading />
                    ) : credit.length === 0 ? (
                        <EmptyState
                            description={t('Posted credit sales create customer outstanding balances.')}
                            title={t('No outstanding credit')}
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>{t('Customer')}</th>
                                        <th>{t('Warehouse')}</th>
                                        <th>{t('Status')}</th>
                                        <th className="is-numeric">{t('Credit limit')}</th>
                                        <th className="is-numeric">{t('Outstanding')}</th>
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
                                                    {t(row.is_active ? 'active' : 'inactive')}
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
                                {t('New draft')}
                            </Button>
                        ) : null
                    }
                    eyebrow={t('Settlement register')}
                    title={t('Customer payments')}
                >
                    <form className="filter-toolbar finance-tab-filter" onSubmit={applyListFilters}>
                        <label className="filter-search"><Icon name="search" size={15} /><input aria-label={t('Search customer payments')} onChange={(event) => setListDraft((value) => ({ ...value, payment_search: event.target.value }))} placeholder={t('Payment ID or customer name')} type="search" value={listDraft.payment_search} /></label>
                        <Button icon="search" type="submit">{t('Search')}</Button>
                    </form>
                    {loading ? (
                        <Loading />
                    ) : payments.length === 0 ? (
                        <EmptyState
                            description={t('Record a received customer payment to begin.')}
                            title={t('No payments')}
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>{t('Payment')}</th>
                                        <th>{t('Customer')}</th>
                                        <th>{t('Method / receiver')}</th>
                                        <th className="is-numeric">{t('Amount')}</th>
                                        <th>{t('Status')}</th>
                                        <th className="ui-table__actions">{t('Actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payments.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                <strong>{row.reference}</strong>
                                                <small>
                                                    {row.payment_date} · {row.payment_reference || t('No external ref')}
                                                </small>
                                            </td>
                                            <td>
                                                {row.customer.name}
                                                <small>
                                                    {row.customer.code} · {row.warehouse.code}
                                                </small>
                                            </td>
                                            <td>
                                                {row.payment_method_name ?? options.payment_methods.find((method) => method.key === row.payment_method)?.name ?? t(row.payment_method.replaceAll('_', ' '))}
                                                <small>{row.received_by?.name ?? t('—')}</small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{money(row.amount)}</strong>
                                            </td>
                                            <td>
                                                <StatusBadge tone={tone(row.status)}>{t(row.status)}</StatusBadge>
                                            </td>
                                            <td className="ui-table__actions">
                                                {row.status === 'draft' && canCreatePayment ? (
                                                    <IconButton
                                                        disabled={busy === row.id}
                                                        icon="check"
                                                        label={t('Post {reference}', { reference: row.reference })}
                                                        onClick={() => postPayment(row)}
                                                        requiresOnline
                                                        tone="primary"
                                                    />
                                                ) : null}
                                                {row.status === 'posted' && canVoidPayment ? (
                                                    <IconButton
                                                        disabled={busy === row.id}
                                                        icon="reverse"
                                                        label={t('Void {reference}', { reference: row.reference })}
                                                        onClick={() => voidPayment(row)}
                                                        requiresOnline
                                                        tone="danger"
                                                    />
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
                description={t('Authorize and confirm cash received directly by the office without linking it to a trip.')}
                footer={<><Button disabled={busy === -2} onClick={() => setCashDialog(false)}>{t('Cancel')}</Button><Button disabled={busy === -2 || !cashForm.sales_representative_id || cashForm.amount <= 0} form="admin-cash-collection-form" requiresOnline tone="primary" type="submit">{busy === -2 ? t('Collecting…') : t('Collect and confirm')}</Button></>}
                onClose={() => setCashDialog(false)} open={cashDialog} title={t('Collect representative cash')} width="compact"
            >
                <form className="customer-payment-form" id="admin-cash-collection-form" onSubmit={collectCash}>
                    <label className="ui-field ui-field--full"><span>{t('Sales representative')}</span><select autoFocus required value={cashForm.sales_representative_id} onChange={(event) => { const selected = balances.find((row) => row.id === Number(event.target.value)); setCashForm((value) => ({ ...value, sales_representative_id: selected?.id ?? 0, amount: selected?.available_to_submit ?? 0 })); }}><option value={0}>{t('Select representative')}</option>{balances.filter((row) => row.available_to_submit > 0).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name} · {money(row.available_to_submit)}</option>)}</select>{cashFields.sales_representative_id?.[0] ? <small className="ui-field__error">{cashFields.sales_representative_id[0]}</small> : null}</label>
                    <label className="ui-field"><span>{t('Amount')}</span><input min={1} onChange={(event) => setCashForm((value) => ({ ...value, amount: editableNumber(event.target.value) }))} required type="number" value={cashForm.amount} />{cashFields.amount?.[0] ? <small className="ui-field__error">{cashFields.amount[0]}</small> : null}</label>
                    <label className="ui-field ui-field--full"><span>{t('Notes')}</span><textarea maxLength={2000} onChange={(event) => setCashForm((value) => ({ ...value, notes: event.target.value }))} rows={3} value={cashForm.notes} /></label>
                </form>
            </Dialog>
            <Dialog
                description={t('Record the received payment as a draft for review and posting.')}
                footer={
                    <>
                        <Button disabled={busy === -1} onClick={() => setDialog(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={busy === -1 || !form.customer_id || form.amount <= 0}
                            form="customer-payment-form"
                            requiresOnline
                            tone="primary"
                            type="submit"
                        >
                            {busy === -1 ? t('Saving…') : t('Save draft')}
                        </Button>
                    </>
                }
                onClose={() => setDialog(false)}
                open={dialog}
                title={t('Record customer payment')}
                width="compact"
            >
                <form className="customer-payment-form" id="customer-payment-form" onSubmit={createPayment}>
                    <label className="ui-field ui-field--full">
                        <span>{t('Customer')}</span>
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
                            <option value={0}>{t('Select customer')}</option>
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
                    {selectedCustomer ? (
                        <div className="customer-payment-summary">
                            <span>
                                <Icon name="customers" size={17} />
                            </span>
                            <div>
                                <small>{selectedCustomer.code}</small>
                                <strong>{selectedCustomer.name}</strong>
                            </div>
                            <div>
                                <small>{t('Outstanding credit')}</small>
                                <strong>{money(selectedCustomer.outstanding_amount)} MMK</strong>
                            </div>
                        </div>
                    ) : null}
                    <label className="ui-field">
                        <span>{t('Amount (MMK)')}</span>
                        <input
                            max={selectedCustomer?.outstanding_amount}
                            min={1}
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    amount: editableNumber(event.target.value),
                                }))
                            }
                            required
                            type="number"
                            value={form.amount}
                        />
                        {fields.amount?.[0] ? <small className="ui-field__error">{fields.amount[0]}</small> : null}
                    </label>
                    <label className="ui-field">
                        <span>{t('Payment date')}</span>
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
                        <span>{t('Method')}</span>
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
                                <option key={method.key} value={method.key}>
                                    {method.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="ui-field">
                        <span>{t('External reference')}</span>
                        <input
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    payment_reference: event.target.value,
                                }))
                            }
                            placeholder={t('Bank, cheque, or receipt ref')}
                            value={form.payment_reference}
                        />
                    </label>
                    <label className="ui-field ui-field--full customer-payment-notes">
                        <span>
                            {t('Notes')} <small>{t('(optional)')}</small>
                        </span>
                        <textarea
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    notes: event.target.value,
                                }))
                            }
                            placeholder={t('Receipt, cashier, or payment details')}
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
    const { t } = useLocale();
    return (
        <div className="ui-loading">
            <span />
            {t('Loading finance data…')}
        </div>
    );
}
