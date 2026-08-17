import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import {
    AdministrationError,
    administrationApi,
    type AccessOptions,
    type ManagedRole,
    type ManagedUser,
    type PaginationMeta,
    type UserFilters,
    type UserInput,
} from '../../services/administration';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

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

function label(value: string) {
    return value
        .replaceAll('_', ' ')
        .replaceAll('-', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value: string | null) {
    if (!value) return 'Never';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the request.';
}

export function AccessManagementPage() {
    const { user: actor } = useSession();
    const canManageRoles = Boolean(actor?.roles.includes('super-admin') || actor?.permissions.includes('role.manage'));
    const [activeTab, setActiveTab] = useState<'roles' | 'users'>('users');
    const [appliedFilters, setAppliedFilters] = useState<UserFilters>({
        page: 1,
    });
    const [draftFilters, setDraftFilters] = useState({
        role: '',
        search: '',
        status: '',
    });
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [roles, setRoles] = useState<ManagedRole[]>([]);
    const [options, setOptions] = useState<AccessOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [userDialog, setUserDialog] = useState<'create' | 'edit' | 'access' | null>(null);
    const [roleDialog, setRoleDialog] = useState<'create' | 'edit' | null>(null);
    const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
    const [selectedRole, setSelectedRole] = useState<ManagedRole | null>(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await administrationApi.users(appliedFilters);
            setUsers(response.data);
            setMeta(response.meta);
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, [appliedFilters]);

    const loadRoles = useCallback(async () => {
        if (!canManageRoles) return;
        try {
            setRoles((await administrationApi.roles()).roles);
        } catch (requestError) {
            setError(errorMessage(requestError));
        }
    }, [canManageRoles]);

    useEffect(() => {
        let active = true;
        void administrationApi
            .accessOptions()
            .then((response) => {
                if (active) setOptions(response);
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError));
            });
        if (canManageRoles) {
            void administrationApi
                .roles()
                .then((response) => {
                    if (active) setRoles(response.roles);
                })
                .catch((requestError) => {
                    if (active) setError(errorMessage(requestError));
                });
        }
        return () => {
            active = false;
        };
    }, [canManageRoles]);

    useEffect(() => {
        let active = true;
        void administrationApi
            .users(appliedFilters)
            .then((response) => {
                if (!active) return;
                setUsers(response.data);
                setMeta(response.meta);
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [appliedFilters]);

    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    const refreshed = async (message: string) => {
        await Promise.all([loadUsers(), loadRoles()]);
        showNotice(message);
    };

    const activeCount = users.filter((managedUser) => managedUser.is_active).length;
    const assignedCount = users.filter((managedUser) => managedUser.warehouses.length > 0).length;

    return (
        <div className="admin-page access-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Access control</p>
                    <h1>Users & roles</h1>
                    <p>Manage account status, warehouse scope, roles, and permissions.</p>
                </div>
                <Button
                    icon="plus"
                    onClick={() => {
                        setSelectedUser(null);
                        setUserDialog('create');
                    }}
                    tone="primary"
                >
                    New user
                </Button>
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint="Current filtered result"
                    icon="users"
                    label="User accounts"
                    value={String(meta.total)}
                />
                <MetricCard hint="On this page" icon="dashboard" label="Active accounts" value={String(activeCount)} />
                <MetricCard
                    hint="On this page"
                    icon="warehouse"
                    label="Warehouse assigned"
                    value={String(assignedCount)}
                />
                <MetricCard
                    hint="Available access profiles"
                    icon="settings"
                    label="Roles"
                    value={String(options.roles.length)}
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
                        Retry
                    </button>
                </div>
            ) : null}

            <div className="ui-tabs" role="tablist" aria-label="Access management sections">
                <button
                    aria-selected={activeTab === 'users'}
                    onClick={() => setActiveTab('users')}
                    role="tab"
                    type="button"
                >
                    Users <span>{meta.total}</span>
                </button>
                {canManageRoles ? (
                    <button
                        aria-selected={activeTab === 'roles'}
                        onClick={() => setActiveTab('roles')}
                        role="tab"
                        type="button"
                    >
                        Roles <span>{roles.length}</span>
                    </button>
                ) : null}
            </div>

            {activeTab === 'users' ? (
                <Panel eyebrow="Directory" title="User accounts">
                    <form
                        className="filter-toolbar"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setLoading(true);
                            setAppliedFilters({ ...draftFilters, page: 1 });
                        }}
                    >
                        <label className="filter-search">
                            <span className="sr-only">Search users</span>
                            <Icon name="search" size={15} />
                            <input
                                onChange={(event) =>
                                    setDraftFilters((value) => ({
                                        ...value,
                                        search: event.target.value,
                                    }))
                                }
                                placeholder="Search name, username, or email"
                                type="search"
                                value={draftFilters.search}
                            />
                        </label>
                        <label>
                            <span className="sr-only">Filter by status</span>
                            <select
                                onChange={(event) =>
                                    setDraftFilters((value) => ({
                                        ...value,
                                        status: event.target.value,
                                    }))
                                }
                                value={draftFilters.status}
                            >
                                <option value="">All statuses</option>
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </label>
                        <label>
                            <span className="sr-only">Filter by role</span>
                            <select
                                onChange={(event) =>
                                    setDraftFilters((value) => ({
                                        ...value,
                                        role: event.target.value,
                                    }))
                                }
                                value={draftFilters.role}
                            >
                                <option value="">All roles</option>
                                {options.roles.map((role) => (
                                    <option key={role.id} value={role.name}>
                                        {label(role.name)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Button icon="search" type="submit">
                            Apply filters
                        </Button>
                    </form>

                    {loading ? (
                        <div className="ui-loading" role="status">
                            <span />
                            Loading user accounts…
                        </div>
                    ) : users.length === 0 ? (
                        <EmptyState
                            description="Change the filters or create the first account."
                            title="No users found"
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table access-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Status</th>
                                        <th>Roles</th>
                                        <th>Warehouse scope</th>
                                        <th>Last sign in</th>
                                        <th className="ui-table__actions">Actions</th>
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
                                                    {managedUser.is_active ? 'Active' : 'Inactive'}
                                                </StatusBadge>
                                            </td>
                                            <td>
                                                <div className="tag-list">
                                                    {managedUser.roles.map((role) => (
                                                        <span key={role}>{label(role)}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                {managedUser.warehouses.length ? (
                                                    <>
                                                        <strong>{managedUser.warehouses[0].name}</strong>
                                                        {managedUser.warehouses.length > 1 ? (
                                                            <small>+{managedUser.warehouses.length - 1} more</small>
                                                        ) : (
                                                            <small>{managedUser.warehouses[0].code}</small>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="table-muted">All / none required</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className="table-primary">
                                                    {dateTime(managedUser.last_login_at)}
                                                </span>
                                                <small>Created {dateTime(managedUser.created_at)}</small>
                                            </td>
                                            <td className="ui-table__actions">
                                                <div className="row-actions">
                                                    <IconButton
                                                        icon="adjustments"
                                                        label={`Edit ${managedUser.name} access`}
                                                        onClick={() => {
                                                            setSelectedUser(managedUser);
                                                            setUserDialog('access');
                                                        }}
                                                    />
                                                    <IconButton
                                                        icon="settings"
                                                        label={`Edit ${managedUser.name} profile`}
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
                            {meta.from ?? 0}–{meta.to ?? 0} of {meta.total} users
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
                            Previous
                        </button>
                        <strong>
                            Page {meta.current_page} of {meta.last_page}
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
                            Next
                        </button>
                    </footer>
                </Panel>
            ) : (
                <Panel
                    actions={
                        <Button
                            icon="plus"
                            onClick={() => {
                                setSelectedRole(null);
                                setRoleDialog('create');
                            }}
                        >
                            New role
                        </Button>
                    }
                    eyebrow="Authorization"
                    title="Roles & permissions"
                >
                    <div className="role-summary">
                        Roles bundle permissions into reusable access profiles. Built-in role names stay fixed to
                        preserve policy behavior.
                    </div>
                    <div className="ui-table-wrap">
                        <table className="ui-table role-table">
                            <thead>
                                <tr>
                                    <th>Role</th>
                                    <th>Users</th>
                                    <th>Permissions</th>
                                    <th>Type</th>
                                    <th className="ui-table__actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((role) => (
                                    <tr key={role.id}>
                                        <td>
                                            <strong>{label(role.name)}</strong>
                                            <small>{role.name}</small>
                                        </td>
                                        <td className="is-numeric">{role.users_count}</td>
                                        <td>
                                            <strong>{role.permissions.length}</strong>
                                            <small>
                                                {role.permissions.slice(0, 3).map(label).join(', ') || 'No permissions'}
                                                {role.permissions.length > 3 ? ` +${role.permissions.length - 3}` : ''}
                                            </small>
                                        </td>
                                        <td>
                                            <StatusBadge tone={role.system ? 'info' : 'neutral'}>
                                                {role.system ? 'Built-in' : 'Custom'}
                                            </StatusBadge>
                                        </td>
                                        <td className="ui-table__actions">
                                            <IconButton
                                                disabled={role.name === 'super-admin'}
                                                icon="settings"
                                                label={`Edit ${label(role.name)}`}
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
                </Panel>
            )}

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
            <RoleDialog
                mode={roleDialog}
                onClose={() => setRoleDialog(null)}
                onSaved={async (message) => {
                    setRoleDialog(null);
                    await refreshed(message);
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
            ? 'Create user account'
            : mode === 'access'
              ? `Assign access · ${user?.name}`
              : `Edit profile · ${user?.name}`;
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
            !window.confirm(`Deactivate ${user.name}? They will be signed out and blocked from logging in.`)
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (mode === 'create') {
                await administrationApi.createUser(form);
                await onSaved('User account created.');
            } else if (mode === 'access' && user) {
                await administrationApi.updateUserAccess(user.id, {
                    roles: form.roles ?? [],
                    warehouse_ids: form.warehouse_ids ?? [],
                });
                await onSaved('User access updated.');
            } else if (user) {
                await administrationApi.updateUser(user.id, form);
                await onSaved('User profile updated.');
            }
        } catch (requestError) {
            if (requestError instanceof AdministrationError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError)],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            description={
                isAccess
                    ? 'Choose at least one role and the warehouses this user can operate.'
                    : 'Profile fields are used for sign-in, identity, and account status.'
            }
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} form="user-management-form" requiresOnline tone="primary" type="submit">
                        {saving ? 'Saving…' : 'Save changes'}
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
                            <span>Full name</span>
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
                            <span>Username</span>
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
                            <span>Email address</span>
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
                            <span>{mode === 'edit' ? 'New password (optional)' : 'Password'}</span>
                            <input
                                autoComplete="new-password"
                                minLength={12}
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
                            <span>Confirm password</span>
                            <input
                                autoComplete="new-password"
                                minLength={12}
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
                                <strong>Active account</strong>
                                <small>Inactive users cannot sign in and existing sessions are revoked.</small>
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
    return (
        <div className="access-selector-grid">
            <fieldset>
                <legend>Roles</legend>
                <p>Permissions come from the selected access profiles.</p>
                <div className="check-list">
                    {options.roles.map((role) => (
                        <label key={role.id}>
                            <input
                                checked={form.roles?.includes(role.name)}
                                onChange={() => toggleRole(role.name)}
                                type="checkbox"
                            />
                            <span>
                                <strong>{label(role.name)}</strong>
                                <small>{role.name}</small>
                            </span>
                        </label>
                    ))}
                </div>
                <FieldError errors={errors} name="roles" />
            </fieldset>
            <fieldset>
                <legend>Warehouse scope</legend>
                <p>Limits operational records visible to this user.</p>
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
            await onSaved(mode === 'create' ? 'Role created.' : 'Role permissions updated.');
        } catch (requestError) {
            if (requestError instanceof AdministrationError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError)],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            description="Permission changes apply immediately to every user assigned this role."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} form="role-management-form" requiresOnline tone="primary" type="submit">
                        {saving ? 'Saving…' : 'Save role'}
                    </Button>
                </>
            }
            onClose={onClose}
            open
            title={mode === 'create' ? 'Create access role' : `Edit role · ${label(role?.name ?? '')}`}
        >
            <form className="management-form" id="role-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <label className="ui-field role-name-field">
                    <span>Role name</span>
                    <input
                        disabled={fixedName}
                        onChange={(event) => setName(event.target.value.toLowerCase().replaceAll(' ', '-'))}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        required
                        value={name}
                    />
                    <small>
                        {fixedName
                            ? 'Built-in role names cannot be changed.'
                            : 'Use lowercase letters, numbers, and hyphens.'}
                    </small>
                    <FieldError errors={errors} name="name" />
                </label>
                <div className="permission-heading">
                    <strong>Permissions</strong>
                    <span>{permissions.length} selected</span>
                </div>
                <div className="permission-groups">
                    {groups.map(([group, groupPermissions]) => (
                        <fieldset key={group}>
                            <legend>{label(group)}</legend>
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
                                    <span>{label(permission.name.split('.').slice(1).join('.'))}</span>
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
