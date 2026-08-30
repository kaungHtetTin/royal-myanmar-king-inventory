import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { warehouseApi, type Warehouse, type WarehouseRegion } from '../../services/warehouses';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function WarehouseCoveragePage() {
    const { formatNumber, t } = useLocale();
    const id = Number(useParams().warehouseId);
    const { user } = useSession();
    const canEdit = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('warehouse.edit'));
    const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [regionName, setRegionName] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError(t('This warehouse link is invalid.')); setLoading(false); return;
        }
        try { setWarehouse((await warehouseApi.get(id)).data); setError(''); }
        catch (requestError) { setError(message(requestError, t('Unable to load warehouse settings.'))); }
        finally { setLoading(false); }
    }, [id, t]);
    // Initial load and explicit retries intentionally share this request function.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);

    const run = async (operation: () => Promise<unknown>, success: string) => {
        setBusy(true); setError(''); setNotice('');
        try { await operation(); await load(); setNotice(success); return true; }
        catch (requestError) { setError(message(requestError, t('Unable to load warehouse settings.'))); return false; }
        finally { setBusy(false); }
    };
    const updateRegion = (region: WarehouseRegion, patch: Partial<WarehouseRegion>) => run(
        () => warehouseApi.updateRegion(region.id, {
            is_active: patch.is_active ?? region.is_active,
            name: patch.name ?? region.name,
            notes: patch.notes ?? region.notes ?? '',
        }),
        t('Region updated.'),
    );

    if (loading) return <div className="ui-loading" role="status"><span />{t('Loading warehouse settings…')}</div>;
    if (!warehouse) return (
        <div className="admin-page warehouse-settings-page">
            <Link className="sale-detail-back" to="/admin/warehouses"><Icon name="chevronLeft" size={13} /> {t('Warehouses')}</Link>
            <div className="ui-flash ui-flash--danger" role="alert"><Icon name="x" size={15} /> {error || t('Warehouse not found.')}<button onClick={() => void load()} type="button">{t('Retry')}</button></div>
        </div>
    );

    const activeRegions = warehouse.regions.filter((region) => region.is_active).length;
    return (
        <div className="admin-page warehouse-settings-page">
            <header className="page-heading warehouse-settings-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/warehouses"><Icon name="chevronLeft" size={13} /> {t('Warehouse directory')}</Link>
                    <p className="ui-eyebrow">{t('Warehouse settings')}</p><h1>{warehouse.name}</h1>
                    <p>{t('Manage the sales regions assigned to this warehouse.')}</p>
                </div>
                <StatusBadge tone={warehouse.is_active ? 'success' : 'danger'}>{t(warehouse.is_active ? 'Active warehouse' : 'Inactive warehouse')}</StatusBadge>
            </header>

            <section aria-label={t('Coverage summary')} className="metric-grid warehouse-settings-metrics">
                <MetricCard hint={t('{count} active', { count: formatNumber(activeRegions) })} icon="building" label={t('Regions')} value={formatNumber(warehouse.regions.length)} />
                <MetricCard hint={t('Assigned to this warehouse')} icon="users" label={t('Sales representatives')} value={formatNumber(warehouse.sales_representatives_count ?? 0)} />
                <MetricCard hint={t('Customer accounts in all regions')} icon="customers" label={t('Customers')} value={formatNumber(warehouse.customers_count ?? 0)} />
                <MetricCard hint={t('Planning, operation, or ending')} icon="truck" label={t('Active trips')} value={formatNumber(warehouse.active_trips_count ?? 0)} />
            </section>
            {notice ? <div className="ui-flash ui-flash--success" role="status"><Icon name="check" size={15} />{notice}</div> : null}
            {error ? <div className="ui-flash ui-flash--danger" role="alert"><Icon name="x" size={15} />{error}</div> : null}

            <section aria-label={t('Warehouse profile')} className="warehouse-profile-strip">
                <div><small>{t('Code')}</small><strong>{warehouse.code}</strong></div>
                <div><small>{t('Address')}</small><strong>{warehouse.address || t('Not specified')}</strong></div>
                <div><small>{t('Phone')}</small><strong>{warehouse.phone || t('Not specified')}</strong></div>
                <div><small>{t('Coverage rule')}</small><strong>{t('Representative and customer → Region')}</strong></div>
            </section>

            <Panel actions={canEdit ? <Button disabled={busy || !warehouse.is_active} icon="plus" onClick={() => setDialogOpen(true)} tone="primary">{t('Add Region')}</Button> : null} className="warehouse-coverage-panel" eyebrow={t('Sales coverage')} title={t('Region management')}>
                {warehouse.regions.length === 0 ? <EmptyState description={t('Add the first Region to define this warehouse’s customer and representative coverage.')} title={t('No Regions configured')} /> : (
                    <div className="ui-table-wrap region-table-wrap"><table className="ui-table region-overview-table">
                        <thead><tr><th>{t('Region')}</th><th>{t('Sales representatives')}</th><th>{t('Customer accounts')}</th><th>{t('Active trips')}</th><th>{t('Status')}</th><th className="ui-table__actions"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
                        <tbody>{warehouse.regions.map((region) => (
                            <tr key={region.id}>
                                <td><RegionNameEditor busy={busy} canEdit={canEdit} key={`${region.id}-${region.name}`} name={region.name} onSave={(name) => updateRegion(region, { name })} />{region.notes ? <small>{region.notes}</small> : null}</td>
                                <td className="is-numeric"><strong>{formatNumber(region.representatives_count ?? 0)}</strong><small>{t('{count} active', { count: formatNumber(region.active_representatives_count ?? 0) })}</small></td>
                                <td className="is-numeric"><strong>{formatNumber(region.customers_count ?? 0)}</strong><small>{t('{count} active', { count: formatNumber(region.active_customers_count ?? 0) })}</small></td>
                                <td className="is-numeric"><strong>{formatNumber(region.active_trips_count ?? 0)}</strong><small>{t('Current workflow')}</small></td>
                                <td><StatusBadge tone={region.is_active ? 'success' : 'danger'}>{t(region.is_active ? 'Active' : 'Inactive')}</StatusBadge></td>
                                <td className="ui-table__actions">{canEdit ? <IconButton disabled={busy} icon={region.is_active ? 'x' : 'check'} label={t('{action} Region {name}', { action: t(region.is_active ? 'Deactivate' : 'Activate'), name: region.name })} onClick={() => void updateRegion(region, { is_active: !region.is_active })} tone={region.is_active ? 'danger' : 'secondary'} /> : null}</td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                )}
            </Panel>

            <Dialog description={t('Create a sales Region under this warehouse. Customers and representatives can be assigned to it after creation.')} footer={<><Button disabled={busy} onClick={() => setDialogOpen(false)} tone="secondary">{t('Cancel')}</Button><Button disabled={busy || !regionName.trim()} form="create-region-form" icon="plus" tone="primary" type="submit">{busy ? t('Creating…') : t('Create Region')}</Button></>} onClose={() => setDialogOpen(false)} open={dialogOpen} title={t('Create Region')}>
                <form className="management-form coverage-create-form" id="create-region-form" onSubmit={async (event: FormEvent) => {
                    event.preventDefault(); if (!regionName.trim()) return;
                    const created = await run(() => warehouseApi.createRegion(warehouse.id, { is_active: true, name: regionName.trim(), notes: '' }), t('Region created.'));
                    if (created) { setRegionName(''); setDialogOpen(false); }
                }}>
                    <label className="ui-field"><span>{t('Region name')}</span><input autoFocus disabled={busy} maxLength={100} onChange={(event) => setRegionName(event.target.value)} placeholder={t('For example, Mandalay North')} required value={regionName} /></label>
                </form>
            </Dialog>
        </div>
    );
}

function RegionNameEditor({ busy, canEdit, name, onSave }: { busy: boolean; canEdit: boolean; name: string; onSave: (name: string) => Promise<unknown> }) {
    const { t } = useLocale();
    const [value, setValue] = useState(name);
    if (!canEdit) return <div className="coverage-name-readonly"><strong>{name}</strong></div>;
    return <form className="coverage-name-editor" onSubmit={(event) => { event.preventDefault(); if (value.trim() && value.trim() !== name) void onSave(value.trim()); }}>
        <label><span className="sr-only">{t('Region name')}</span><input disabled={busy} maxLength={100} onChange={(event) => setValue(event.target.value)} value={value} /></label>
        {value.trim() !== name ? <IconButton className="coverage-name-editor__save" disabled={busy || !value.trim()} icon="check" label={t('Save Region name')} tone="primary" type="submit" /> : null}
    </form>;
}
