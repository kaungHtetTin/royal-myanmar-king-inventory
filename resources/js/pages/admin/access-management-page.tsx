import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
    AdministrationError,
    administrationApi,
    type AccessOptions,
    type ManagedRole,
    type ManagedUser,
    type PaginationMeta,
    type UserFilters,
    type UserInput,
    type UserSummary,
} from '../../services/administration';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptyOptions: AccessOptions = {
    permissions: [],
    roles: [],
    warehouses: [],
};
const emptySummary: UserSummary = { active: 0, roles: 0, total: 0, warehouse_assigned: 0 };

function label(value: string) {
    return value
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function AccessManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('Never'));
    const [appliedFilters, setAppliedFilters] = useState<UserFilters>({
        page: 1,
    });
    const [draftFilters, setDraftFilters] = useState({
        role: '',
        search: '',
        status: '',
    });
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [options, setOptions] = useState<AccessOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [userDialog, setUserDialog] = useState<'create' | 'edit' | 'access' | null>(null);
    const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await administrationApi.users(appliedFilters);
            setUsers(response.data);
            setMeta(response.meta);
            setSummary(response.summary ?? emptySummary);
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [appliedFilters, t]);

    useEffect(() => {
        let active = true;
        void administrationApi
            .accessOptions()
            .then((response) => {
                if (active) setOptions(response);
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError, t('Unable to complete the request.')));
            });
        return () => {
            active = false;
        };
    }, [t]);

    useEffect(() => {
        let active = true;
        void administrationApi
            .users(appliedFilters)
            .then((response) => {
                if (!active) return;
                setUsers(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError, t('Unable to complete the request.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [appliedFilters, t]);

    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    const refreshed = async (message: string) => {
        await loadUsers();
        showNotice(message);
    };

    return (
        <div className="admin-page access-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Access control')}</p>
                    <h1>{t('Users')}</h1>
                    <p>{t('Manage account details, status, assigned roles, and warehouse scope.')}</p>
                </div>
                <Button
                    icon="plus"
                    onClick={() => {
                        setSelectedUser(null);
                        setUserDialog('create');
                    }}
                    tone="primary"
                >
                    {t('New user')}
                </Button>
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="users"
                    label={t('User accounts')}
                    value={formatNumber(summary.total)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="dashboard"
                    label={t('Active accounts')}
                    value={formatNumber(summary.active)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="warehouse"
                    label={t('Warehouse assigned')}
                    value={formatNumber(summary.warehouse_assigned)}
                />
            </div>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="box" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void loadUsers()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <Panel eyebrow={t('Directory')} title={t('User accounts')}>
                <form
                    className="filter-toolbar"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        setAppliedFilters({ ...draftFilters, page: 1 });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">{t('Search users')}</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={t('Search name, username, or email')}
                            type="search"
                            value={draftFilters.search}
                        />
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by status')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    status: event.target.value,
                                }))
                            }
                            value={draftFilters.status}
                        >
                            <option value="">{t('All statuses')}</option>
                            <option value="active">{t('Active')}</option>
                            <option value="inactive">{t('Inactive')}</option>
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by role')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    role: event.target.value,
                                }))
                            }
                            value={draftFilters.role}
                        >
                            <option value="">{t('All roles')}</option>
                            {options.roles.map((role) => (
                                <option key={role.id} value={role.name}>
                                    {t(label(role.name))}
                                </option>
                            ))}
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        {t('Apply filters')}
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        {t('Loading user accounts…')}
                    </div>
                ) : users.length === 0 ? (
                    <EmptyState
                        description={t('Change the filters or create the first account.')}
                        title={t('No users found')}
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table access-table">
                            <thead>
                                <tr>
                                    <th>{t('User')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Roles')}</th>
                                    <th>{t('Warehouse scope')}</th>
                                    <th>{t('Last sign in')}</th>
                                    <th className="ui-table__actions">{t('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((managedUser) => (
                                    <tr key={managedUser.id}>
                                        <td>
                                            <strong className="table-primary">{managedUser.name}</strong>
                                            <small>
                                                @{managedUser.username} · {managedUser.email}
                                            </small>
                                        </td>
                                        <td>
                                            <StatusBadge tone={managedUser.is_active ? 'success' : 'danger'}>
                                                {t(managedUser.is_active ? 'Active' : 'Inactive')}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <div className="tag-list">
                                                {managedUser.roles.map((role) => (
                                                    <span key={role}>{t(label(role))}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            {managedUser.warehouses.length ? (
                                                <>
                                                    <strong>{managedUser.warehouses[0].name}</strong>
                                                    {managedUser.warehouses.length > 1 ? (
                                                        <small>
                                                            {t('+{count} more', {
                                                                count: formatNumber(managedUser.warehouses.length - 1),
                                                            })}
                                                        </small>
                                                    ) : (
                                                        <small>{managedUser.warehouses[0].code}</small>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="table-muted">{t('All / none required')}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(managedUser.last_login_at)}</span>
                                            <small>
                                                {t('Created {date}', { date: dateTime(managedUser.created_at) })}
                                            </small>
                                        </td>
                                        <td className="ui-table__actions">
                                            <div className="row-actions">
                                                <IconButton
                                                    icon="adjustments"
                                                    label={t('Edit {name} access', { name: managedUser.name })}
                                                    onClick={() => {
                                                        setSelectedUser(managedUser);
                                                        setUserDialog('access');
                                                    }}
                                                />
                                                <IconButton
                                                    icon="settings"
                                                    label={t('Edit {name} profile', { name: managedUser.name })}
                                                    onClick={() => {
                                                        setSelectedUser(managedUser);
                                                        setUserDialog('edit');
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <footer className="table-footer">
                    <span>
                        {t('{from}–{to} of {total} users', {
                            from: formatNumber(meta.from ?? 0),
                            to: formatNumber(meta.to ?? 0),
                            total: formatNumber(meta.total),
                        })}
                    </span>
                    <button
                        disabled={meta.current_page <= 1 || loading}
                        onClick={() => {
                            setLoading(true);
                            setAppliedFilters((value) => ({
                                ...value,
                                page: meta.current_page - 1,
                            }));
                        }}
                        type="button"
                    >
                        {t('Previous')}
                    </button>
                    <strong>
                        {t('Page {current} of {last}', {
                            current: formatNumber(meta.current_page),
                            last: formatNumber(meta.last_page),
                        })}
                    </strong>
                    <button
                        disabled={meta.current_page >= meta.last_page || loading}
                        onClick={() => {
                            setLoading(true);
                            setAppliedFilters((value) => ({
                                ...value,
                                page: meta.current_page + 1,
                            }));
                        }}
                        type="button"
                    >
                        {t('Next')}
                    </button>
                </footer>
            </Panel>

            <UserDialog
                mode={userDialog}
                onClose={() => setUserDialog(null)}
                onSaved={async (message) => {
                    setUserDialog(null);
                    await refreshed(message);
                }}
                options={options}
                user={selectedUser}
            />
        </div>
    );
}

export function RoleManagementSection() {
    const { formatNumber, t } = useLocale();
    const [roles, setRoles] = useState<ManagedRole[]>([]);
    const [options, setOptions] = useState<AccessOptions>(emptyOptions);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [roleDialog, setRoleDialog] = useState<'create' | 'edit' | null>(null);
    const [selectedRole, setSelectedRole] = useState<ManagedRole | null>(null);

    const loadRoles = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [roleResponse, accessOptions] = await Promise.all([
                administrationApi.roles(),
                administrationApi.accessOptions(),
            ]);
            setRoles(roleResponse.roles);
            setOptions(accessOptions);
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void loadRoles();
    }, [loadRoles]);

    return (
        <div className="settings-role-management">
            <header className="settings-editor-heading settings-role-heading">
                <div>
                    <p className="ui-eyebrow">{t('Authorization')}</p>
                    <h2>{t('Roles & permissions')}</h2>
                    <p>{t('Bundle permissions into reusable access profiles for user accounts.')}</p>
                </div>
                <Button
                    icon="plus"
                    onClick={() => {
                        setSelectedRole(null);
                        setRoleDialog('create');
                    }}
                >
                    {t('New role')}
                </Button>
            </header>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error}
                    <button onClick={() => void loadRoles()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <section className="settings-subsection settings-role-card">
                <div className="role-summary">
                    {t(
                        'Built-in role names stay fixed to preserve policy behavior. Permission changes apply immediately.',
                    )}
                </div>
                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        {t('Loading roles…')}
                    </div>
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table role-table">
                            <thead>
                                <tr>
                                    <th>{t('Role')}</th>
                                    <th>{t('Users')}</th>
                                    <th>{t('Permissions')}</th>
                                    <th>{t('Type')}</th>
                                    <th className="ui-table__actions">{t('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((role) => (
                                    <tr key={role.id}>
                                        <td>
                                            <strong>{t(label(role.name))}</strong>
                                            <small>{role.name}</small>
                                        </td>
                                        <td className="is-numeric">{formatNumber(role.users_count)}</td>
                                        <td>
                                            <strong>{formatNumber(role.permissions.length)}</strong>
                                            <small>
                                                {role.permissions
                                                    .slice(0, 3)
                                                    .map((value) => t(label(value)))
                                                    .join(', ') || t('No permissions')}
                                                {role.permissions.length > 3
                                                    ? t(' +{count}', {
                                                          count: formatNumber(role.permissions.length - 3),
                                                      })
                                                    : ''}
                                            </small>
                                        </td>
                                        <td>
                                            <StatusBadge tone={role.system ? 'info' : 'neutral'}>
                                                {t(role.system ? 'Built-in' : 'Custom')}
                                            </StatusBadge>
                                        </td>
                                        <td className="ui-table__actions">
                                            <IconButton
                                                disabled={role.name === 'super-admin'}
                                                icon="settings"
                                                label={t('Edit {name}', { name: t(label(role.name)) })}
                                                onClick={() => {
                                                    setSelectedRole(role);
                                                    setRoleDialog('edit');
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <RoleDialog
                mode={roleDialog}
                onClose={() => setRoleDialog(null)}
                onSaved={async (message) => {
                    setRoleDialog(null);
                    await loadRoles();
                    setNotice(message);
                    window.setTimeout(() => setNotice(''), 4000);
                }}
                options={options}
                role={selectedRole}
            />
        </div>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}

function UserDialog({
    mode,
    onClose,
    onSaved,
    options,
    user,
}: {
    mode: 'create' | 'edit' | 'access' | null;
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    options: AccessOptions;
    user: ManagedUser | null;
}) {
    const { t } = useLocale();
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [form, setForm] = useState<UserInput>({
        email: '',
        is_active: true,
        name: '',
        password: '',
        password_confirmation: '',
        roles: [],
        username: '',
        warehouse_ids: [],
    });

    useEffect(() => {
        setErrors({});
        setForm({
            email: user?.email ?? '',
            is_active: user?.is_active ?? true,
            name: user?.name ?? '',
            password: '',
            password_confirmation: '',
            roles: user?.roles ?? [],
            username: user?.username ?? '',
            warehouse_ids: user?.warehouses.map((warehouse) => warehouse.id) ?? [],
        });
    }, [mode, user]);

    if (!mode) return null;
    const isAccess = mode === 'access';
    const title =
        mode === 'create'
            ? t('Create user account')
            : mode === 'access'
              ? t('Assign access · {name}', { name: user?.name ?? '' })
              : t('Edit profile · {name}', { name: user?.name ?? '' });
    const toggleRole = (name: string) =>
        setForm((value) => ({
            ...value,
            roles: value.roles?.includes(name)
                ? value.roles.filter((role) => role !== name)
                : [...(value.roles ?? []), name],
        }));
    const toggleWarehouse = (id: number) =>
        setForm((value) => ({
            ...value,
            warehouse_ids: value.warehouse_ids?.includes(id)
                ? value.warehouse_ids.filter((warehouseId) => warehouseId !== id)
                : [...(value.warehouse_ids ?? []), id],
        }));

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            mode === 'edit' &&
            user?.is_active &&
            !form.is_active &&
            !window.confirm(
                t('Deactivate {name}? They will be signed out and blocked from logging in.', { name: user.name }),
            )
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (mode === 'create') {
                await administrationApi.createUser(form);
                await onSaved(t('User account created.'));
            } else if (mode === 'access' && user) {
                await administrationApi.updateUserAccess(user.id, {
                    roles: form.roles ?? [],
                    warehouse_ids: form.warehouse_ids ?? [],
                });
                await onSaved(t('User access updated.'));
            } else if (user) {
                await administrationApi.updateUser(user.id, form);
                await onSaved(t('User profile updated.'));
            }
        } catch (requestError) {
            if (requestError instanceof AdministrationError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError, t('Unable to complete the request.'))],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            description={
                isAccess
                    ? t('Choose at least one role and the warehouses this user can operate.')
                    : t('Profile fields are used for sign-in, identity, and account status.')
            }
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button disabled={saving} form="user-management-form" requiresOnline tone="primary" type="submit">
                        {saving ? t('Saving…') : t('Save changes')}
                    </Button>
                </>
            }
            onClose={onClose}
            open
            title={title}
            width={isAccess ? 'compact' : 'standard'}
        >
            <form className="management-form" id="user-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                {!isAccess ? (
                    <div className="form-grid">
                        <label className="ui-field">
                            <span>{t('Full name')}</span>
                            <input
                                autoFocus
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        name: event.target.value,
                                    }))
                                }
                                required
                                value={form.name}
                            />
                            <FieldError errors={errors} name="name" />
                        </label>
                        <label className="ui-field">
                            <span>{t('Username')}</span>
                            <input
                                autoComplete="off"
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        username: event.target.value,
                                    }))
                                }
                                required
                                value={form.username}
                            />
                            <FieldError errors={errors} name="username" />
                        </label>
                        <label className="ui-field form-grid__wide">
                            <span>{t('Email address')}</span>
                            <input
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        email: event.target.value,
                                    }))
                                }
                                required
                                type="email"
                                value={form.email}
                            />
                            <FieldError errors={errors} name="email" />
                        </label>
                        <label className="ui-field">
                            <span>
                                {t(
                                    mode === 'edit'
                                        ? 'New password (optional, minimum 6 characters)'
                                        : 'Password (minimum 6 characters)',
                                )}
                            </span>
                            <input
                                autoComplete="new-password"
                                minLength={6}
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        password: event.target.value,
                                    }))
                                }
                                required={mode === 'create'}
                                type="password"
                                value={form.password}
                            />
                            <FieldError errors={errors} name="password" />
                        </label>
                        <label className="ui-field">
                            <span>{t('Confirm password')}</span>
                            <input
                                autoComplete="new-password"
                                minLength={6}
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        password_confirmation: event.target.value,
                                    }))
                                }
                                required={mode === 'create'}
                                type="password"
                                value={form.password_confirmation}
                            />
                        </label>
                        <label className="ui-check form-grid__wide">
                            <input
                                checked={form.is_active}
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        is_active: event.target.checked,
                                    }))
                                }
                                type="checkbox"
                            />
                            <span>
                                <strong>{t('Active account')}</strong>
                                <small>{t('Inactive users cannot sign in and existing sessions are revoked.')}</small>
                            </span>
                        </label>
                    </div>
                ) : null}
                {mode === 'create' || isAccess ? (
                    <AccessSelectors
                        errors={errors}
                        form={form}
                        options={options}
                        toggleRole={toggleRole}
                        toggleWarehouse={toggleWarehouse}
                    />
                ) : null}
            </form>
        </Dialog>
    );
}

function AccessSelectors({
    errors,
    form,
    options,
    toggleRole,
    toggleWarehouse,
}: {
    errors: Record<string, string[]>;
    form: UserInput;
    options: AccessOptions;
    toggleRole: (name: string) => void;
    toggleWarehouse: (id: number) => void;
}) {
    const { t } = useLocale();
    return (
        <div className="access-selector-grid">
            <fieldset>
                <legend>{t('Roles')}</legend>
                <p>{t('Permissions come from the selected access profiles.')}</p>
                <div className="check-list">
                    {options.roles.map((role) => (
                        <label key={role.id}>
                            <input
                                checked={form.roles?.includes(role.name)}
                                onChange={() => toggleRole(role.name)}
                                type="checkbox"
                            />
                            <span>
                                <strong>{t(label(role.name))}</strong>
                                <small>{role.name}</small>
                            </span>
                        </label>
                    ))}
                </div>
                <FieldError errors={errors} name="roles" />
            </fieldset>
            <fieldset>
                <legend>{t('Warehouse scope')}</legend>
                <p>{t('Limits operational records visible to this user.')}</p>
                <div className="check-list">
                    {options.warehouses.map((warehouse) => (
                        <label key={warehouse.id}>
                            <input
                                checked={form.warehouse_ids?.includes(warehouse.id)}
                                onChange={() => toggleWarehouse(warehouse.id)}
                                type="checkbox"
                            />
                            <span>
                                <strong>{warehouse.name}</strong>
                                <small>{warehouse.code}</small>
                            </span>
                        </label>
                    ))}
                </div>
                <FieldError errors={errors} name="warehouse_ids" />
            </fieldset>
        </div>
    );
}

function RoleDialog({
    mode,
    onClose,
    onSaved,
    options,
    role,
}: {
    mode: 'create' | 'edit' | null;
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    options: AccessOptions;
    role: ManagedRole | null;
}) {
    const { formatNumber, t } = useLocale();
    const [name, setName] = useState('');
    const [permissions, setPermissions] = useState<string[]>([]);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setName(role?.name ?? '');
        setPermissions(role?.permissions ?? []);
        setErrors({});
    }, [mode, role]);
    const groups = useMemo(() => {
        const grouped = options.permissions.reduce<Record<string, AccessOptions['permissions']>>(
            (result, permission) => {
                const group = permission.name.split('.')[0];
                result[group] = [...(result[group] ?? []), permission];
                return result;
            },
            {},
        );
        return Object.entries(grouped);
    }, [options.permissions]);
    if (!mode) return null;
    const fixedName = Boolean(role?.system);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            if (mode === 'create') await administrationApi.createRole({ name, permissions });
            else if (role)
                await administrationApi.updateRole(role.id, {
                    name,
                    permissions,
                });
            await onSaved(t(mode === 'create' ? 'Role created.' : 'Role permissions updated.'));
        } catch (requestError) {
            if (requestError instanceof AdministrationError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError, t('Unable to complete the request.'))],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            description={t('Permission changes apply immediately to every user assigned this role.')}
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button disabled={saving} form="role-management-form" requiresOnline tone="primary" type="submit">
                        {saving ? t('Saving…') : t('Save role')}
                    </Button>
                </>
            }
            onClose={onClose}
            open
            title={
                mode === 'create'
                    ? t('Create access role')
                    : t('Edit role · {name}', { name: t(label(role?.name ?? '')) })
            }
        >
            <form className="management-form" id="role-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <label className="ui-field role-name-field">
                    <span>{t('Role name')}</span>
                    <input
                        disabled={fixedName}
                        onChange={(event) => setName(event.target.value.toLowerCase().replaceAll(' ', '-'))}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        required
                        value={name}
                    />
                    <small>
                        {fixedName
                            ? t('Built-in role names cannot be changed.')
                            : t('Use lowercase letters, numbers, and hyphens.')}
                    </small>
                    <FieldError errors={errors} name="name" />
                </label>
                <div className="permission-heading">
                    <strong>{t('Permissions')}</strong>
                    <span>{t('{count} selected', { count: formatNumber(permissions.length) })}</span>
                </div>
                <div className="permission-groups">
                    {groups.map(([group, groupPermissions]) => (
                        <fieldset key={group}>
                            <legend>{t(label(group))}</legend>
                            {groupPermissions?.map((permission) => (
                                <label key={permission.id}>
                                    <input
                                        checked={permissions.includes(permission.name)}
                                        onChange={() =>
                                            setPermissions((value) =>
                                                value.includes(permission.name)
                                                    ? value.filter((name) => name !== permission.name)
                                                    : [...value, permission.name],
                                            )
                                        }
                                        type="checkbox"
                                    />
                                    <span>{t(label(permission.name.split('.').slice(1).join('.')))}</span>
                                    <code>{permission.name}</code>
                                </label>
                            ))}
                        </fieldset>
                    ))}
                </div>
                <FieldError errors={errors} name="permissions" />
            </form>
        </Dialog>
    );
}
