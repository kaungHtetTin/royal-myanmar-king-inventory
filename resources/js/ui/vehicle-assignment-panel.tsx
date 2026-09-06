import { useState } from 'react';
import { useLocale } from '../localization/locale-context';
import { useSession } from '../auth/session-context';
import { Button, Panel } from './primitives';

export function VehicleAssignmentPanel({ kind, id, currentId, currentName, onSaved }: {
    kind: 'vehicles' | 'representatives'; id: number; currentId: number | null; currentName: string | null; onSaved: () => Promise<void>;
}) {
    const { t } = useLocale();
    const { user } = useSession();
    const canEdit = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes(kind === 'vehicles' ? 'vehicle.edit' : 'representative.edit'));
    const [editing, setEditing] = useState(false);
    const [options, setOptions] = useState<Array<{ id: number; name: string }>>([]);
    const [selected, setSelected] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const endpoint = `api/admin/${kind}/${id}/assignment`;
    const failure = (error: unknown) => {
        const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }).response?.data;
        setError(Object.values(response?.errors ?? {}).flat()[0] ?? response?.message ?? t('Unable to update assignment.'));
    };
    const edit = async () => {
        setBusy(true); setError('');
        try {
            const response = await window.axios.get(endpoint);
            setOptions(response.data.data); setSelected(currentId ? String(currentId) : ''); setEditing(true);
        } catch (error) { failure(error); } finally { setBusy(false); }
    };
    const save = async (value: number | null) => {
        setBusy(true); setError('');
        try {
            await window.axios.put(endpoint, kind === 'vehicles' ? { representative_id: value } : { vehicle_id: value });
            setEditing(false); await onSaved();
        } catch (error) { failure(error); } finally { setBusy(false); }
    };
    return <Panel title={t('Vehicle assignment')} actions={canEdit && !editing ? <Button disabled={busy} onClick={() => void edit()}>{currentId ? t('Change assignment') : t('Assign')}</Button> : undefined}>
        <div className="vehicle-assignment-panel">
            <div><small>{t(kind === 'vehicles' ? 'Sales representative' : 'Vehicle')}</small><strong>{currentName || t('Unassigned')}</strong></div>
            {error ? <div className="ui-flash ui-flash--danger" role="alert">{error}</div> : null}
            {editing ? <form onSubmit={(event) => { event.preventDefault(); void save(Number(selected) || null); }}>
                <label className="ui-field"><span>{t(kind === 'vehicles' ? 'Sales representative' : 'Vehicle')}</span>
                    <select disabled={busy} value={selected} onChange={(event) => setSelected(event.target.value)}>
                        <option value="">{t('Unassigned')}</option>
                        {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                    </select>
                </label>
                <div className="page-heading__actions"><Button disabled={busy} type="submit" tone="primary">{t('Save')}</Button><Button disabled={busy} onClick={() => setEditing(false)}>{t('Cancel')}</Button>
                    {currentId ? <Button disabled={busy} onClick={() => { if (window.confirm(t('Remove this vehicle assignment?'))) void save(null); }}>{t('Remove assignment')}</Button> : null}
                </div>
            </form> : null}
        </div>
    </Panel>;
}
