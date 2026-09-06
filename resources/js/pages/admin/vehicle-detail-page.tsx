import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { vehicleApi, type Vehicle } from '../../services/vehicles';
import { useLocale } from '../../localization/locale-context';
import { Panel, StatusBadge } from '../../ui/primitives';
import { VehicleAssignmentPanel } from '../../ui/vehicle-assignment-panel';

export function VehicleDetailPage() {
    const id = Number(useParams().vehicleId);
    const { t } = useLocale();
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        try { setVehicle((await vehicleApi.show(id)).data); setError(''); }
        catch (error) { setError(error instanceof Error ? error.message : t('Unable to load vehicle.')); }
    }, [id, t]);
    useEffect(() => { void Promise.resolve().then(load); }, [load]);
    return <div className="admin-page">
        <header className="page-heading"><div><Link to="/admin/vehicles">{t('Vehicles')}</Link><h1>{vehicle?.vehicle_number ?? t('Vehicle')}</h1></div>{vehicle ? <StatusBadge tone={vehicle.is_active ? 'success' : 'neutral'}>{t(vehicle.is_active ? 'Active' : 'Inactive')}</StatusBadge> : null}</header>
        {error ? <div role="alert" className="ui-flash ui-flash--danger">{error}<button onClick={() => void load()}>{t('Retry')}</button></div> : null}
        {vehicle ? <>
            <Panel title={t('Vehicle information')}><dl className="transfer-detail-facts"><div><dt>{t('Type')}</dt><dd>{vehicle.vehicle_type}</dd></div><div><dt>{t('Brand')}</dt><dd>{vehicle.brand || '—'}</dd></div><div><dt>{t('Model')}</dt><dd>{vehicle.model || '—'}</dd></div><div><dt>{t('Notes')}</dt><dd>{vehicle.notes || '—'}</dd></div></dl></Panel>
            <VehicleAssignmentPanel kind="vehicles" id={id} currentId={vehicle.sales_representative_id} currentName={vehicle.representative?.name ?? null} onSaved={load} />
        </> : !error ? <div role="status" className="ui-loading">{t('Loading…')}</div> : null}
    </div>;
}
