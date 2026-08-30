import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { reportingApi, type AuditResponse, type ReportFilters } from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const empty: AuditResponse = {
    data: [],
    meta: {
        current_page: 1,
        from: null,
        last_page: 1,
        per_page: 25,
        to: null,
        total: 0,
    },
    filters: { warehouses: [], actors: [], modules: [] },
};
type AuditFilters = ReportFilters & {
    actor_id?: number;
    module?: string;
    action?: string;
};
function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function AuditLogPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const [response, setResponse] = useState(empty);
    const [filters, setFilters] = useState<AuditFilters>({ page: 1 });
    const [draft, setDraft] = useState<AuditFilters>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResponse(await reportingApi.audits(filters));
        } catch (requestError) {
            setError(message(requestError, t('Unable to load audit history.')));
        } finally {
            setLoading(false);
        }
    }, [filters, t]);
    useEffect(() => {
        let active = true;
        void reportingApi
            .audits({ page: 1 })
            .then((value) => {
                if (active) setResponse(value);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load audit history.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [t]);
    const apply = (event: FormEvent) => {
        event.preventDefault();
        setFilters({ ...draft, page: 1 });
    };
    return (
        <div className="admin-page audit-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Traceability')}</p>
                    <h1>{t('Audit log')}</h1>
                    <p>
                        {t(
                            'Search critical configuration, stock, transfer, sales, cash, and credit actions within your authorized scope.',
                        )}
                    </p>
                </div>
                <StatusBadge tone="info">{t('Append only')}</StatusBadge>
            </header>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>{t('Retry')}</button>
                </div>
            ) : null}
            <Panel eyebrow={t('Authorized history')} title={t('Critical events')}>
                <form className="filter-toolbar audit-filters" onSubmit={apply}>
                    <div className="audit-filter-scroll">
                        <div className="audit-filter-fields">
                            <label className="filter-search">
                                <Icon name="search" size={15} />
                                <input
                                    aria-label={t('Search audit log')}
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            search: event.target.value,
                                        }))
                                    }
                                    placeholder={t('Actor, event, or record ID')}
                                    type="search"
                                    value={draft.search ?? ''}
                                />
                            </label>
                            <select
                                aria-label={t('Audit module')}
                                onChange={(event) =>
                                    setDraft((value) => ({
                                        ...value,
                                        module: event.target.value || undefined,
                                    }))
                                }
                                value={draft.module ?? ''}
                            >
                                <option value="">{t('All modules')}</option>
                                {response.filters.modules.map((module) => (
                                    <option key={module} value={module}>
                                        {module.replaceAll('_', ' ')}
                                    </option>
                                ))}
                            </select>
                            <select
                                aria-label={t('Audit actor')}
                                onChange={(event) =>
                                    setDraft((value) => ({
                                        ...value,
                                        actor_id: Number(event.target.value) || undefined,
                                    }))
                                }
                                value={draft.actor_id ?? 0}
                            >
                                <option value={0}>{t('All actors')}</option>
                                {response.filters.actors.map((actor) => (
                                    <option key={actor.id} value={actor.id}>
                                        {actor.name} · {actor.username}
                                    </option>
                                ))}
                            </select>
                            <select
                                aria-label={t('Audit warehouse')}
                                onChange={(event) =>
                                    setDraft((value) => ({
                                        ...value,
                                        warehouse_id: Number(event.target.value) || undefined,
                                    }))
                                }
                                value={draft.warehouse_id ?? 0}
                            >
                                <option value={0}>{t('All warehouses')}</option>
                                {response.filters.warehouses.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                        {warehouse.code} · {warehouse.name}
                                    </option>
                                ))}
                            </select>
                            <label className="report-date">
                                <span>{t('From')}</span>
                                <input
                                    aria-label={t('Audit date from')}
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            date_from: event.target.value || undefined,
                                        }))
                                    }
                                    type="date"
                                    value={draft.date_from ?? ''}
                                />
                            </label>
                            <label className="report-date">
                                <span>{t('To')}</span>
                                <input
                                    aria-label={t('Audit date to')}
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            date_to: event.target.value || undefined,
                                        }))
                                    }
                                    type="date"
                                    value={draft.date_to ?? ''}
                                />
                            </label>
                        </div>
                    </div>
                    <Button icon="search" type="submit">
                        {t('Apply')}
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        {t('Loading audit events…')}
                    </div>
                ) : response.data.length === 0 ? (
                    <EmptyState
                        description={t('Adjust the filters or wait for authorized application activity.')}
                        title={t('No audit events')}
                    />
                ) : (
                    <div className="audit-list">
                        {response.data.map((row) => (
                            <article key={row.id}>
                                <div className="audit-list__timeline">
                                    <span />
                                    <small>{dateTime(row.created_at)}</small>
                                </div>
                                <div className="audit-list__event">
                                    <div>
                                        <StatusBadge
                                            tone={
                                                row.action.includes('void') ||
                                                row.action.includes('reverse') ||
                                                row.action.includes('reject')
                                                    ? 'danger'
                                                    : row.action.includes('post') ||
                                                        row.action.includes('confirm') ||
                                                        row.action.includes('receive')
                                                      ? 'success'
                                                      : 'info'
                                            }
                                        >
                                            {row.module}
                                        </StatusBadge>
                                        <strong>{row.action.replaceAll('_', ' ')}</strong>
                                    </div>
                                    <small>
                                        {row.actor
                                            ? `${row.actor.name} · @${row.actor.username}`
                                            : t('System / unknown actor')}{' '}
                                        · {row.subject_type ?? t('No subject')}{' '}
                                        {row.subject_id ? `#${row.subject_id}` : ''}
                                    </small>
                                </div>
                                <div className="audit-list__actions">
                                    {row.subject_url ? (
                                        <Link
                                            aria-label={t('Open source for audit {id}', { id: row.id })}
                                            to={row.subject_url}
                                        >
                                            <Icon name="chevronRight" />
                                        </Link>
                                    ) : null}
                                    <details>
                                        <summary>{t('Changes')}</summary>
                                        <div className="audit-change-grid">
                                            <AuditValue label={t('Before')} value={row.old} />
                                            <AuditValue label={t('After')} value={row.new} />
                                            <AuditValue label={t('Context')} value={row.metadata} />
                                        </div>
                                    </details>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <footer className="table-footer">
                    <span>
                        {t('{from}–{to} of {total}', {
                            from: formatNumber(response.meta.from ?? 0),
                            to: formatNumber(response.meta.to ?? 0),
                            total: formatNumber(response.meta.total),
                        })}
                    </span>
                    <button
                        disabled={response.meta.current_page <= 1 || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: response.meta.current_page - 1,
                            }))
                        }
                    >
                        {t('Previous')}
                    </button>
                    <strong>
                        {t('Page {current} of {last}', {
                            current: formatNumber(response.meta.current_page),
                            last: formatNumber(response.meta.last_page),
                        })}
                    </strong>
                    <button
                        disabled={response.meta.current_page >= response.meta.last_page || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: response.meta.current_page + 1,
                            }))
                        }
                    >
                        {t('Next')}
                    </button>
                </footer>
            </Panel>
        </div>
    );
}

function AuditValue({ label, value }: { label: string; value: Record<string, unknown> | null }) {
    return (
        <section>
            <strong>{label}</strong>
            <pre>{value ? JSON.stringify(value, null, 2) : '—'}</pre>
        </section>
    );
}
