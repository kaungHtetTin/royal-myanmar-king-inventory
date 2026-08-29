import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { warehouseApi, type Warehouse, type WarehouseRegion, type WarehouseWay } from '../../services/warehouses';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load warehouse settings.';
}

export function WarehouseCoveragePage() {
    const { warehouseId } = useParams();
    const id = Number(warehouseId);
    const { user } = useSession();
    const canEdit = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('warehouse.edit'));
    const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [regionName, setRegionName] = useState('');
    const [wayNames, setWayNames] = useState<Record<number, string>>({});
    const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
    const [regionDialogOpen, setRegionDialogOpen] = useState(false);
    const [wayDialogOpen, setWayDialogOpen] = useState(false);

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError('This warehouse link is invalid.');
            setLoading(false);
            return;
        }
        try {
            const response = await warehouseApi.get(id);
            setWarehouse(response.data);
            setError('');
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        let active = true;
        void warehouseApi
            .get(id)
            .then((response) => {
                if (active) setWarehouse(response.data);
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

    const totals = useMemo(() => {
        const regions = warehouse?.regions ?? [];
        const ways = regions.flatMap((region) => region.ways);
        return {
            activeRegions: regions.filter((region) => region.is_active).length,
            activeWays: ways.filter((way) => way.is_active).length,
            regions: regions.length,
            ways: ways.length,
        };
    }, [warehouse]);
    const selectedRegion =
        warehouse?.regions.find((region) => region.id === selectedRegionId) ?? warehouse?.regions[0] ?? null;

    const run = async (operation: () => Promise<unknown>, success: string) => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await operation();
            await load();
            setNotice(success);
            return true;
        } catch (requestError) {
            setError(message(requestError));
            return false;
        } finally {
            setBusy(false);
        }
    };
    const updateRegion = (region: WarehouseRegion, patch: Partial<WarehouseRegion>) =>
        run(
            () =>
                warehouseApi.updateRegion(region.id, {
                    is_active: patch.is_active ?? region.is_active,
                    name: patch.name ?? region.name,
                    notes: patch.notes ?? region.notes ?? '',
                }),
            'Region updated.',
        );
    const updateWay = (way: WarehouseWay, patch: Partial<WarehouseWay>) =>
        run(
            () =>
                warehouseApi.updateWay(way.id, {
                    is_active: patch.is_active ?? way.is_active,
                    name: patch.name ?? way.name,
                    notes: patch.notes ?? way.notes ?? '',
                }),
            'Way updated.',
        );

    if (loading) {
        return (
            <div className="ui-loading" role="status">
                <span />
                Loading warehouse settings…
            </div>
        );
    }

    if (!warehouse) {
        return (
            <div className="admin-page warehouse-settings-page">
                <Link className="sale-detail-back" to="/admin/warehouses">
                    <Icon name="chevronLeft" size={13} /> Warehouses
                </Link>
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} /> {error || 'Warehouse not found.'}
                    <button onClick={() => void load()} type="button">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page warehouse-settings-page">
            <header className="page-heading warehouse-settings-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/warehouses">
                        <Icon name="chevronLeft" size={13} /> Warehouse directory
                    </Link>
                    <p className="ui-eyebrow">Warehouse settings</p>
                    <h1>{warehouse.name}</h1>
                    <p>Manage the Region and Way hierarchy separately from warehouse master data.</p>
                </div>
                <StatusBadge tone={warehouse.is_active ? 'success' : 'danger'}>
                    {warehouse.is_active ? 'Active warehouse' : 'Inactive warehouse'}
                </StatusBadge>
            </header>

            <section aria-label="Coverage summary" className="metric-grid warehouse-settings-metrics">
                <MetricCard
                    hint={`${totals.activeRegions} active`}
                    icon="building"
                    label="Regions"
                    value={String(totals.regions)}
                />
                <MetricCard
                    hint={`${totals.activeWays} active`}
                    icon="warehouse"
                    label="Ways"
                    value={String(totals.ways)}
                />
                <MetricCard
                    hint="Assigned administrators"
                    icon="users"
                    label="Users"
                    value={String(warehouse.users_count)}
                />
                <MetricCard hint="Generated automatically" icon="settings" label="Way codes" value="Auto" />
            </section>

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
                </div>
            ) : null}

            <section aria-label="Warehouse profile" className="warehouse-profile-strip">
                <div>
                    <small>Code</small>
                    <strong>{warehouse.code}</strong>
                </div>
                <div>
                    <small>Address</small>
                    <strong>{warehouse.address || 'Not specified'}</strong>
                </div>
                <div>
                    <small>Phone</small>
                    <strong>{warehouse.phone || 'Not specified'}</strong>
                </div>
                <div>
                    <small>Coverage rule</small>
                    <strong>Representative → Region · Customer → Way</strong>
                </div>
            </section>

            <Panel className="warehouse-coverage-panel" eyebrow="Sales coverage" title="Region and Way management">
                <div className="warehouse-coverage-workspace">
                    <aside aria-label="Region navigation" className="region-inner-menu">
                        <header className="region-inner-menu__heading">
                            <div>
                                <strong>Regions</strong>
                                <small>{totals.regions} configured</small>
                            </div>
                        </header>
                        <nav aria-label="Warehouse Regions" className="region-inner-menu__list">
                            {warehouse.regions.map((region) => (
                                <button
                                    aria-current={selectedRegion?.id === region.id ? 'page' : undefined}
                                    className={selectedRegion?.id === region.id ? 'is-active' : ''}
                                    key={region.id}
                                    onClick={() => setSelectedRegionId(region.id)}
                                    type="button"
                                >
                                    <span>
                                        <strong>{region.name}</strong>
                                        <small>{region.ways.length} Ways</small>
                                    </span>
                                    <span className={region.is_active ? 'is-active' : 'is-inactive'}>
                                        {region.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </button>
                            ))}
                        </nav>
                        {canEdit ? (
                            <footer className="region-inner-menu__footer">
                                <Button
                                    disabled={busy || !warehouse.is_active}
                                    icon="plus"
                                    onClick={() => setRegionDialogOpen(true)}
                                    tone="primary"
                                >
                                    Add Region
                                </Button>
                            </footer>
                        ) : null}
                    </aside>

                    <main className="way-workspace">
                        {!selectedRegion ? (
                            <EmptyState
                                description={
                                    canEdit
                                        ? 'Add the first Region from the menu to begin defining Ways.'
                                        : 'No coverage hierarchy has been configured.'
                                }
                                title="Select a Region"
                            />
                        ) : (
                            <>
                                <header className="way-workspace__heading">
                                    <CoverageNameEditor
                                        busy={busy}
                                        canEdit={canEdit}
                                        key={`${selectedRegion.id}-${selectedRegion.name}`}
                                        label="Region name"
                                        name={selectedRegion.name}
                                        onSave={(name) => updateRegion(selectedRegion, { name })}
                                        supportingText={`${selectedRegion.ways.length} Ways in this Region`}
                                    />
                                    <div className="coverage-region__actions">
                                        <StatusBadge tone={selectedRegion.is_active ? 'success' : 'danger'}>
                                            {selectedRegion.is_active ? 'Active' : 'Inactive'}
                                        </StatusBadge>
                                        {canEdit ? (
                                            <IconButton
                                                disabled={busy}
                                                icon={selectedRegion.is_active ? 'x' : 'check'}
                                                label={`${selectedRegion.is_active ? 'Deactivate' : 'Activate'} Region ${selectedRegion.name}`}
                                                onClick={() =>
                                                    void updateRegion(selectedRegion, {
                                                        is_active: !selectedRegion.is_active,
                                                    })
                                                }
                                                tone={selectedRegion.is_active ? 'danger' : 'secondary'}
                                            />
                                        ) : null}
                                    </div>
                                </header>

                                <div className="way-workspace__list">
                                    {selectedRegion.ways.length === 0 ? (
                                        <EmptyState
                                            description="Add a Way to make this Region available for customer assignment."
                                            title="No Ways in this Region"
                                        />
                                    ) : null}
                                    {selectedRegion.ways.map((way) => (
                                        <div className="coverage-way" key={way.id}>
                                            <CoverageNameEditor
                                                busy={busy}
                                                canEdit={canEdit}
                                                key={`${way.id}-${way.name}`}
                                                label={`${way.code} name`}
                                                name={way.name}
                                                onSave={(name) => updateWay(way, { name })}
                                                supportingText={way.code}
                                            />
                                            <StatusBadge tone={way.is_active ? 'success' : 'danger'}>
                                                {way.is_active ? 'Active' : 'Inactive'}
                                            </StatusBadge>
                                            {canEdit ? (
                                                <IconButton
                                                    disabled={busy}
                                                    icon={way.is_active ? 'x' : 'check'}
                                                    label={`${way.is_active ? 'Deactivate' : 'Activate'} Way ${way.name}`}
                                                    onClick={() => void updateWay(way, { is_active: !way.is_active })}
                                                    tone={way.is_active ? 'danger' : 'secondary'}
                                                />
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                                {canEdit ? (
                                    <footer className="way-workspace__footer">
                                        <Button
                                            disabled={busy || !selectedRegion.is_active}
                                            icon="plus"
                                            onClick={() => setWayDialogOpen(true)}
                                            tone="primary"
                                        >
                                            Add Way
                                        </Button>
                                    </footer>
                                ) : null}
                            </>
                        )}
                    </main>
                </div>
            </Panel>

            <Dialog
                description="Create a sales Region under this warehouse. Representatives can be assigned to it after creation."
                footer={
                    <>
                        <Button disabled={busy} onClick={() => setRegionDialogOpen(false)} tone="secondary">
                            Cancel
                        </Button>
                        <Button
                            disabled={busy || !regionName.trim()}
                            form="create-region-form"
                            icon="plus"
                            tone="primary"
                            type="submit"
                        >
                            {busy ? 'Creating…' : 'Create Region'}
                        </Button>
                    </>
                }
                onClose={() => setRegionDialogOpen(false)}
                open={regionDialogOpen}
                title="Create Region"
            >
                <form
                    className="management-form coverage-create-form"
                    id="create-region-form"
                    onSubmit={async (event: FormEvent) => {
                        event.preventDefault();
                        if (!regionName.trim()) return;
                        const created = await run(
                            () =>
                                warehouseApi.createRegion(warehouse.id, {
                                    is_active: true,
                                    name: regionName.trim(),
                                    notes: '',
                                }),
                            'Region created.',
                        );
                        if (created) {
                            setRegionName('');
                            setRegionDialogOpen(false);
                        }
                    }}
                >
                    <label className="ui-field">
                        <span>Region name</span>
                        <input
                            autoFocus
                            disabled={busy}
                            maxLength={100}
                            onChange={(event) => setRegionName(event.target.value)}
                            placeholder="For example, Mandalay North"
                            required
                            value={regionName}
                        />
                    </label>
                    <div className="ui-form-note" role="note">
                        <Icon name="warning" size={16} />
                        <span>Region names must be unique within {warehouse.name}.</span>
                    </div>
                </form>
            </Dialog>

            <Dialog
                description={
                    selectedRegion
                        ? `Create a Way under ${selectedRegion.name}. Its code will be generated automatically.`
                        : 'Select a Region before creating a Way.'
                }
                footer={
                    <>
                        <Button disabled={busy} onClick={() => setWayDialogOpen(false)} tone="secondary">
                            Cancel
                        </Button>
                        <Button
                            disabled={busy || !selectedRegion || !wayNames[selectedRegion.id]?.trim()}
                            form="create-way-form"
                            icon="plus"
                            tone="primary"
                            type="submit"
                        >
                            {busy ? 'Creating…' : 'Create Way'}
                        </Button>
                    </>
                }
                onClose={() => setWayDialogOpen(false)}
                open={wayDialogOpen && Boolean(selectedRegion)}
                title="Create Way"
            >
                {selectedRegion ? (
                    <form
                        className="management-form coverage-create-form"
                        id="create-way-form"
                        onSubmit={async (event: FormEvent) => {
                            event.preventDefault();
                            const name = wayNames[selectedRegion.id]?.trim();
                            if (!name) return;
                            const created = await run(
                                () => warehouseApi.createWay(selectedRegion.id, { is_active: true, name, notes: '' }),
                                'Way created with an automatic code.',
                            );
                            if (created) {
                                setWayNames((value) => ({ ...value, [selectedRegion.id]: '' }));
                                setWayDialogOpen(false);
                            }
                        }}
                    >
                        <label className="ui-field">
                            <span>Way name</span>
                            <input
                                autoFocus
                                disabled={busy}
                                maxLength={100}
                                onChange={(event) =>
                                    setWayNames((value) => ({ ...value, [selectedRegion.id]: event.target.value }))
                                }
                                placeholder="For example, Chanayethazan"
                                required
                                value={wayNames[selectedRegion.id] ?? ''}
                            />
                        </label>
                        <div className="ui-form-note" role="note">
                            <Icon name="settings" size={16} />
                            <span>The Way code is assigned automatically when you create it.</span>
                        </div>
                    </form>
                ) : null}
            </Dialog>
        </div>
    );
}

function CoverageNameEditor({
    busy,
    canEdit,
    label,
    name,
    onSave,
    supportingText,
}: {
    busy: boolean;
    canEdit: boolean;
    label: string;
    name: string;
    onSave: (name: string) => Promise<unknown>;
    supportingText: string;
}) {
    const [value, setValue] = useState(name);
    const changed = value.trim() !== name;
    if (!canEdit)
        return (
            <div className="coverage-name-readonly">
                <strong>{name}</strong>
                <small>{supportingText}</small>
            </div>
        );
    return (
        <form
            className="coverage-name-editor"
            onSubmit={(event) => {
                event.preventDefault();
                if (changed && value.trim()) void onSave(value.trim());
            }}
        >
            <label>
                <span className="sr-only">{label}</span>
                <input
                    disabled={busy}
                    maxLength={100}
                    onChange={(event) => setValue(event.target.value)}
                    value={value}
                />
            </label>
            <small>{supportingText}</small>
            {changed ? (
                <IconButton
                    className="coverage-name-editor__save"
                    disabled={busy || !value.trim()}
                    icon="check"
                    label={`Save ${label}`}
                    tone="primary"
                    type="submit"
                />
            ) : null}
        </form>
    );
}
