import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { PaginationMeta } from '../../services/administration';
import { financeApi, FinanceError, type CashOverview, type CashSubmission, type CashTransaction } from '../../services/finance';
import { tripApi, type Trip } from '../../services/trips';
import { editableNumber } from '../../ui/form-values';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, Pagination, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

type SubmissionScope = 'trip' | 'all';
type CashView = 'returns' | 'ledger';
const emptyOverview: CashOverview = { representative: { id: 0, code: '', name: '' }, cash_hold: 0, pending_submissions: 0, available_to_submit: 0 };
const emptyMeta: PaginationMeta = { current_page: 1, from: null, last_page: 1, per_page: 10, to: null, total: 0 };
const tone = (status: string) => status === 'confirmed' ? 'success' : status === 'pending' ? 'warning' : status === 'reversed' ? 'danger' : 'neutral';
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function CashWorkspacePage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => formatNumber(value);
    const dateTime = (value: string | null) => value ? formatDateTime(value) : '—';
    const [overview, setOverview] = useState(emptyOverview);
    const [trip, setTrip] = useState<Trip | null>(null);
    const [scope, setScope] = useState<SubmissionScope>('trip');
    const [view, setView] = useState<CashView>('returns');
    const [submissions, setSubmissions] = useState<CashSubmission[]>([]);
    const [activity, setActivity] = useState<CashTransaction[]>([]);
    const [submissionMeta, setSubmissionMeta] = useState(emptyMeta);
    const [activityMeta, setActivityMeta] = useState(emptyMeta);
    const [submissionPage, setSubmissionPage] = useState(1);
    const [activityPage, setActivityPage] = useState(1);
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
            const current = await tripApi.current();
            const currentTrip = current.data;
            const submissionRequest = scope === 'all'
                ? financeApi.ownSubmissions(submissionPage)
                : currentTrip
                  ? financeApi.ownSubmissions(submissionPage, currentTrip.id)
                  : Promise.resolve({ data: [], meta: emptyMeta });
            const [cash, list, ledger] = await Promise.all([
                financeApi.ownOverview(),
                submissionRequest,
                financeApi.ownCashActivity(activityPage),
            ]);
            setTrip(currentTrip);
            setOverview(cash);
            setSubmissions(list.data);
            setSubmissionMeta(list.meta);
            setActivity(ledger.data);
            setActivityMeta(ledger.meta);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load cash hold.')));
        } finally {
            setLoading(false);
        }
    }, [activityPage, scope, submissionPage, t]);

    // Data loading is intentionally tied to pagination and history scope.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);

    const canSubmit = Boolean(trip && ['operation', 'ending'].includes(trip.status));
    const financial = trip?.financial_summary;
    const tripResponsibility = trip ? Math.max(0, trip.opening_cash_balance + (financial?.cash_hold_sales ?? 0) + (financial?.cash_credit_collected ?? 0) - (financial?.cash_submitted_confirmed ?? 0)) : 0;
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
            setSubmissionPage(1);
            await load();
            setNotice(t('Cash handover is linked to this trip and awaits office confirmation.'));
            window.setTimeout(() => setNotice(''), 4500);
        } catch (requestError) {
            setFields(requestError instanceof FinanceError ? requestError.fields : {});
            setError(message(requestError, t('Unable to submit cash.')));
        } finally {
            setSaving(false);
        }
    };
    const cancel = async (submission: CashSubmission) => {
        const reason = window.prompt(t('Why are you cancelling {reference}?', { reference: submission.reference }));
        if (!reason?.trim()) return;
        setSaving(true);
        try {
            await financeApi.cancelSubmission(submission.id, reason.trim());
            await load();
            setNotice(t('{reference} cancelled. Cash hold was unchanged.', { reference: submission.reference }));
        } catch (requestError) {
            setError(message(requestError, t('Unable to cancel cash handover.')));
        } finally {
            setSaving(false);
        }
    };
    const changeScope = (next: SubmissionScope) => {
        setScope(next);
        setSubmissionPage(1);
    };
    const pendingOnPage = useMemo(() => submissions.filter((row) => row.status === 'pending').length, [submissions]);

    return (
        <div className="sales-cash-page">
            <header className="sales-page-heading">
                <div><p>{t('Trip settlement')}</p><h1>{t('Cash hold')}</h1></div>
                {canSubmit ? <IconButton disabled={loading || overview.available_to_submit <= 0} icon="plus" label={t('Return cash')} onClick={open} tone="primary" /> : null}
            </header>

            {trip ? (
                <section className="cash-trip-context" aria-label={t('Current trip')}>
                    <div className="cash-trip-context__icon"><Icon name="truck" size={19} /></div>
                    <div><small>{t('Current trip')}</small><strong>{trip.reference} · {trip.title}</strong><p>{trip.warehouse.code} · {trip.warehouse.name}</p></div>
                    <StatusBadge tone={trip.status === 'operation' ? 'success' : trip.status === 'ending' ? 'warning' : 'neutral'}>{t(trip.status)}</StatusBadge>
                </section>
            ) : (
                <div className="cash-workflow-note cash-workflow-note--neutral"><Icon name="warning" size={16} /><div><strong>{t('No active trip')}</strong><span>{t('Cash handover is unavailable. Previous custody history remains below.')}</span></div></div>
            )}
            {trip?.status === 'planning' ? <div className="cash-workflow-note"><Icon name="warning" size={16} /><div><strong>{t('Cash return starts during operation')}</strong><span>{t('Start this trip before recording an office handover.')}</span></div></div> : null}
            {trip?.status === 'ending' ? <div className="cash-workflow-note cash-workflow-note--warning"><Icon name="cash" size={16} /><div><strong>{t('Trip settlement is in progress')}</strong><span>{t('Return the remaining cash and wait for office confirmation before completing the trip.')}</span></div></div> : null}

            <section aria-label={t('Cash hold summary')} className="sales-summary-grid sales-cash-summary">
                <article className="sales-summary-card is-primary"><span><Icon name="cash" size={18} /></span><small>{t('Current hold')}</small><strong>{money(overview.cash_hold)}</strong><p>{t('MMK in your custody')}</p></article>
                <article className="sales-summary-card cash-available-card"><span><Icon name="sales" size={18} /></span><small>{t('Available to return')}</small><strong>{money(overview.available_to_submit)}</strong><p>{t('After pending handovers')}</p></article>
                <article className="sales-summary-card"><span><Icon name="sales" size={18} /></span><small>{t('Sales added to hold')}</small><strong>{money(financial?.cash_hold_sales ?? 0)}</strong><p>{t('Cash-custody methods only')}</p></article>
                <article className="sales-summary-card cash-returned-card"><span><Icon name="transfer" size={18} /></span><small>{t('Confirmed returned')}</small><strong>{money(financial?.cash_submitted_confirmed ?? 0)}</strong><p>{t('Accepted by the office')}</p></article>
            </section>
            {trip ? <section className="cash-trip-breakdown" aria-label={t('Trip cash position')}>
                <div><small>{t('Opening cash')}</small><strong>{money(trip.opening_cash_balance)} MMK</strong></div>
                <div><small>{t('Credit collected as cash')}</small><strong>{money(financial?.cash_credit_collected ?? 0)} MMK</strong></div>
                <div><small>{t('Pending handover')}</small><strong>{money(financial?.cash_submitted_pending ?? 0)} MMK</strong></div>
                <div><small>{t('Trip responsibility')}</small><strong>{money(tripResponsibility)} MMK</strong></div>
            </section> : null}
            {notice ? <div className="ui-flash ui-flash--success"><Icon name="cash" size={15} />{notice}</div> : null}
            {error ? <div className="ui-flash ui-flash--danger"><Icon name="x" size={15} />{error}<button onClick={() => void load()}>{t('Retry')}</button></div> : null}

            <nav className="section-tabs sales-cash-tabs" aria-label={t('Cash history sections')} role="tablist">
                <button aria-selected={view === 'returns'} className={view === 'returns' ? 'is-active' : ''} onClick={() => setView('returns')} role="tab" type="button"><Icon name="transfer" size={15} />{t('Cash returns')}<span className="section-tab-count">{formatNumber(submissionMeta.total)}</span></button>
                <button aria-selected={view === 'ledger'} className={view === 'ledger' ? 'is-active' : ''} onClick={() => setView('ledger')} role="tab" type="button"><Icon name="reports" size={15} />{t('Cash ledger')}<span className="section-tab-count">{formatNumber(activityMeta.total)}</span></button>
            </nav>
            <div className="sales-cash-grid sales-cash-grid--single">
                {view === 'returns' ?
                <section className="sales-section cash-submissions-panel">
                    <header className="cash-panel-heading">
                        <div><p className="ui-eyebrow">{t('Office handovers')}</p><h2>{scope === 'trip' ? t('Current trip returns') : t('All cash returns')}</h2></div>
                        <div className="cash-scope-tabs" role="tablist" aria-label={t('Cash return history')}>
                            <button aria-selected={scope === 'trip'} onClick={() => changeScope('trip')} role="tab">{t('This trip')}</button>
                            <button aria-selected={scope === 'all'} onClick={() => changeScope('all')} role="tab">{t('All history')}</button>
                        </div>
                    </header>
                    <div className="cash-panel-meta">{t('{records} records · {pending} pending on this page', { records: formatNumber(submissionMeta.total), pending: formatNumber(pendingOnPage) })}</div>
                    {loading ? <div className="ui-loading"><span />{t('Loading submissions…')}</div> : submissions.length === 0 ? (
                        <EmptyState description={scope === 'trip' && trip ? t('Cash returned during this trip will appear here.') : t('No cash handovers match this view.')} title={t('No cash returns yet')} />
                    ) : <div className="cash-card-list">{submissions.map((row) => (
                        <article key={row.id}>
                            <div className="cash-card-list__identity"><span><Icon name="cash" size={16} /></span><div><strong>{row.reference}</strong><small>{scope === 'all' && row.trip ? `${row.trip.reference} · ` : ''}{dateTime(row.created_at)}</small></div></div>
                            <div className="cash-card-list__details"><StatusBadge tone={tone(row.status)}>{t(row.status)}</StatusBadge><strong className="cash-card-list__amount">{money(row.amount)} <small>MMK</small></strong>{row.status === 'pending' ? <IconButton disabled={saving} icon="x" label={t('Cancel {reference}', { reference: row.reference })} onClick={() => void cancel(row)} requiresOnline tone="danger" /> : null}</div>
                        </article>
                    ))}</div>}
                    <Pagination label={t('Cash submissions')} loading={loading} meta={submissionMeta} onPageChange={setSubmissionPage} />
                </section> : null}

                {view === 'ledger' ? <section className="sales-section cash-activity-panel">
                    <header><div><p className="ui-eyebrow">{t('Append-only ledger')}</p><h2>{t('All custody activity')}</h2></div><small>{t('{count} entries', { count: formatNumber(activityMeta.total) })}</small></header>
                    <p className="cash-ledger-caption">{t('Sales, office confirmations, and reversals remain visible across every trip.')}</p>
                    {loading ? <div className="ui-loading"><span />{t('Loading activity…')}</div> : activity.length === 0 ? <EmptyState description={t('Posted cash sales and office confirmations appear here.')} title={t('No cash activity')} /> : <div className="cash-ledger-list">{activity.map((row) => (
                        <article key={row.id}><span className={row.amount_delta >= 0 ? 'is-in' : 'is-out'}>{row.amount_delta >= 0 ? '+' : '−'}</span><div><strong>{row.reference}</strong><small>{t(row.type.replaceAll('_', ' '))} · {dateTime(row.occurred_at)}</small></div><b className={row.amount_delta >= 0 ? 'is-positive' : 'is-negative'}>{row.amount_delta >= 0 ? '+' : '−'}{money(Math.abs(row.amount_delta))}</b></article>
                    ))}</div>}
                    <Pagination label={t('Cash activity')} loading={loading} meta={activityMeta} onPageChange={setActivityPage} />
                </section> : null}
            </div>

            <Dialog description={t('Return cash for {trip}. The balance changes only after office confirmation.', { trip: trip?.reference ?? '—' })} footer={<><Button disabled={saving} onClick={() => setDialog(false)}>{t('Cancel')}</Button><Button disabled={saving || form.amount <= 0} form="cash-submission-form" requiresOnline tone="primary" type="submit">{t(saving ? 'Submitting…' : 'Submit for confirmation')}</Button></>} onClose={() => setDialog(false)} open={dialog} title={t('Return trip cash')} width="compact">
                <div className="cash-automatic-note"><Icon name="truck" size={16} /><span>{t('Automatically linked to {trip} and {warehouse}.', { trip: trip?.reference ?? '—', warehouse: trip?.warehouse.name ?? '—' })}</span></div>
                <form className="ui-form-grid" id="cash-submission-form" onSubmit={submit}>
                    <label className="ui-field ui-field--full"><span>{t('Amount (MMK)')}</span><input autoFocus max={overview.available_to_submit} min={1} onChange={(event) => setForm((value) => ({ ...value, amount: editableNumber(event.target.value) }))} required type="number" value={form.amount} />{fields.amount?.[0] ? <small className="ui-field__error">{fields.amount[0]}</small> : <small>{t('Pending handovers reserve the available amount.')}</small>}</label>
                    <label className="ui-field ui-field--full"><span>{t('Handover note')}</span><textarea onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} placeholder={t('Cashier, envelope, or handover detail')} rows={3} value={form.notes} /></label>
                </form>
            </Dialog>
        </div>
    );
}
