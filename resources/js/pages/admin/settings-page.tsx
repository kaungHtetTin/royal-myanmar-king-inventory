import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import { useBranding } from '../../branding/branding-context';
import {
    SettingsError,
    settingsApi,
    type AdminProfile,
    type ProfileInput,
    type SettingsInput,
} from '../../services/settings';
import { Icon, type IconName } from '../../ui/icons';
import { Button } from '../../ui/primitives';
import { RoleManagementSection } from './access-management-page';

type Section = 'profile' | 'branding' | 'operations' | 'roles';

const emptyProfile: ProfileInput = {
    current_password: '',
    email: '',
    name: '',
    password: '',
    password_confirmation: '',
    username: '',
};
const emptySettings: SettingsInput = {
    business_address: '',
    business_email: '',
    business_name: 'StockFlow',
    business_phone: '',
    business_tagline: '',
    currency_code: 'MMK',
    favicon: null,
    invoice_footer: '',
    logo: null,
    low_stock_threshold: 10,
    primary_color: '#087f74',
    remove_favicon: false,
    remove_logo: false,
    timezone: 'Asia/Yangon',
};
const sections: Array<{ description: string; icon: IconName; id: Section; label: string }> = [
    { description: 'Your account and password', icon: 'users', id: 'profile', label: 'Admin profile' },
    { description: 'Name, color and assets', icon: 'settings', id: 'branding', label: 'Business branding' },
    {
        description: 'Contacts and system defaults',
        icon: 'adjustments',
        id: 'operations',
        label: 'Operational defaults',
    },
    { description: 'Access profiles and permissions', icon: 'users', id: 'roles', label: 'Roles & permissions' },
];

function fieldError(fields: Record<string, string[]>, name: string) {
    return fields[name]?.[0];
}

function useFilePreview(file: File | null, existing: string | null, removed: boolean) {
    return useMemo(() => {
        if (removed) return null;
        if (!file) return existing;
        return URL.createObjectURL(file);
    }, [existing, file, removed]);
}

function AssetPicker({
    accept,
    file,
    label,
    onChange,
    onRemove,
    preview,
}: {
    accept: string;
    file: File | null;
    label: string;
    onChange: (file: File | null) => void;
    onRemove: () => void;
    preview: string | null;
}) {
    return (
        <div className="settings-asset-picker">
            <span className="settings-asset-picker__preview">
                {preview ? <img alt={`${label} preview`} src={preview} /> : <Icon name="box" size={20} />}
            </span>
            <span className="settings-asset-picker__copy">
                <strong>{label}</strong>
                <small>{file?.name ?? (preview ? 'Current image' : 'No image uploaded')}</small>
            </span>
            <label className="ui-button ui-button--secondary settings-upload-button">
                <Icon name="plus" size={15} />
                <span>Choose</span>
                <input
                    accept={accept}
                    aria-label={`Choose ${label.toLowerCase()}`}
                    onChange={(event) => onChange(event.target.files?.[0] ?? null)}
                    type="file"
                />
            </label>
            {preview ? (
                <button
                    className="ui-icon-button ui-icon-button--danger"
                    onClick={onRemove}
                    title={`Remove ${label}`}
                    type="button"
                >
                    <Icon name="x" size={16} />
                </button>
            ) : null}
        </div>
    );
}

export function SettingsPage() {
    const { setBranding } = useBranding();
    const { updateUser } = useSession();
    const [section, setSection] = useState<Section>('profile');
    const [profile, setProfile] = useState(emptyProfile);
    const [settings, setSettings] = useState(emptySettings);
    const [storedLogo, setStoredLogo] = useState<string | null>(null);
    const [storedFavicon, setStoredFavicon] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [fields, setFields] = useState<Record<string, string[]>>({});
    const [notice, setNotice] = useState('');
    const logoPreview = useFilePreview(settings.logo, storedLogo, settings.remove_logo);
    const faviconPreview = useFilePreview(settings.favicon, storedFavicon, settings.remove_favicon);

    useEffect(() => {
        let active = true;
        void settingsApi
            .get()
            .then((response) => {
                if (!active) return;
                setProfile((value) => ({ ...value, ...response.profile, email: response.profile.email ?? '' }));
                setSettings((value) => ({
                    ...value,
                    ...response.operations,
                    business_address: response.operations.business_address ?? '',
                    business_email: response.operations.business_email ?? '',
                    business_name: response.branding.business_name,
                    business_phone: response.operations.business_phone ?? '',
                    business_tagline: response.branding.business_tagline ?? '',
                    invoice_footer: response.operations.invoice_footer ?? '',
                    primary_color: response.branding.primary_color,
                }));
                setStoredLogo(response.branding.logo_url);
                setStoredFavicon(response.branding.favicon_url);
                setError('');
            })
            .catch((requestError) =>
                setError(requestError instanceof Error ? requestError.message : 'Unable to load settings.'),
            )
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    useEffect(
        () => () => {
            if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
            if (faviconPreview?.startsWith('blob:')) URL.revokeObjectURL(faviconPreview);
        },
        [faviconPreview, logoPreview],
    );

    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    const saveProfile = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setFields({});
        try {
            const response = await settingsApi.updateProfile(profile);
            const updated: AdminProfile = response.profile;
            updateUser({ email: updated.email, name: updated.name, username: updated.username });
            setProfile((value) => ({ ...value, current_password: '', password: '', password_confirmation: '' }));
            showNotice('Admin profile updated.');
        } catch (requestError) {
            const failure =
                requestError instanceof SettingsError ? requestError : new SettingsError('Unable to save profile.');
            setError(failure.message);
            setFields(failure.fields);
        } finally {
            setSaving(false);
        }
    };

    const saveApplication = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        setFields({});
        try {
            const response = await settingsApi.update(settings);
            setBranding(response.branding);
            setStoredLogo(response.branding.logo_url);
            setStoredFavicon(response.branding.favicon_url);
            setSettings((value) => ({
                ...value,
                ...response.operations,
                business_address: response.operations.business_address ?? '',
                business_email: response.operations.business_email ?? '',
                business_phone: response.operations.business_phone ?? '',
                favicon: null,
                invoice_footer: response.operations.invoice_footer ?? '',
                logo: null,
                remove_favicon: false,
                remove_logo: false,
            }));
            showNotice(section === 'branding' ? 'Business branding updated.' : 'Operational defaults updated.');
        } catch (requestError) {
            const failure =
                requestError instanceof SettingsError ? requestError : new SettingsError('Unable to save settings.');
            setError(failure.message);
            setFields(failure.fields);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="admin-page settings-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Office configuration</p>
                    <h1>Application settings</h1>
                    <p>Manage your account, visual identity, contact details, and operational defaults.</p>
                </div>
            </header>

            {notice ? (
                <div className="ui-flash ui-flash--success">
                    <Icon name="check" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="warning" size={15} />
                    {error}
                </div>
            ) : null}

            <div className="settings-workspace">
                <aside className="settings-index" aria-label="Settings sections">
                    <header>
                        <p className="ui-eyebrow">Configuration</p>
                        <h2>Application</h2>
                    </header>
                    <nav>
                        {sections.map((item) => (
                            <button
                                aria-current={section === item.id ? 'page' : undefined}
                                className={section === item.id ? 'is-active' : ''}
                                key={item.id}
                                onClick={() => {
                                    setSection(item.id);
                                    setError('');
                                    setFields({});
                                }}
                                type="button"
                            >
                                <span>
                                    <Icon name={item.icon} size={17} />
                                </span>
                                <span>
                                    <strong>{item.label}</strong>
                                    <small>{item.description}</small>
                                </span>
                            </button>
                        ))}
                    </nav>
                </aside>

                <main className="settings-editor">
                    {loading ? (
                        <div className="ui-loading" role="status">
                            <span />
                            Loading settings…
                        </div>
                    ) : null}
                    {!loading && section === 'profile' ? (
                        <form onSubmit={saveProfile}>
                            <SettingsHeading
                                eyebrow="Account"
                                title="Admin profile"
                                description="Update the identity used in the console and secure your password."
                            />
                            <div className="settings-form-grid">
                                <Field error={fieldError(fields, 'name')} label="Display name">
                                    <input
                                        onChange={(event) =>
                                            setProfile((value) => ({ ...value, name: event.target.value }))
                                        }
                                        required
                                        value={profile.name}
                                    />
                                </Field>
                                <Field error={fieldError(fields, 'username')} label="Username">
                                    <input
                                        onChange={(event) =>
                                            setProfile((value) => ({ ...value, username: event.target.value }))
                                        }
                                        required
                                        value={profile.username}
                                    />
                                </Field>
                                <Field className="is-full" error={fieldError(fields, 'email')} label="Email address">
                                    <input
                                        onChange={(event) =>
                                            setProfile((value) => ({ ...value, email: event.target.value }))
                                        }
                                        type="email"
                                        value={profile.email}
                                    />
                                </Field>
                            </div>
                            <section className="settings-subsection">
                                <header>
                                    <Icon name="warning" size={17} />
                                    <div>
                                        <strong>Change password</strong>
                                        <small>Leave these fields blank to keep your current password.</small>
                                    </div>
                                </header>
                                <div className="settings-form-grid settings-form-grid--password">
                                    <Field error={fieldError(fields, 'current_password')} label="Current password">
                                        <input
                                            autoComplete="current-password"
                                            onChange={(event) =>
                                                setProfile((value) => ({
                                                    ...value,
                                                    current_password: event.target.value,
                                                }))
                                            }
                                            type="password"
                                            value={profile.current_password}
                                        />
                                    </Field>
                                    <Field error={fieldError(fields, 'password')} label="New password">
                                        <input
                                            autoComplete="new-password"
                                            minLength={8}
                                            onChange={(event) =>
                                                setProfile((value) => ({ ...value, password: event.target.value }))
                                            }
                                            type="password"
                                            value={profile.password}
                                        />
                                    </Field>
                                    <Field
                                        error={fieldError(fields, 'password_confirmation')}
                                        label="Confirm new password"
                                    >
                                        <input
                                            autoComplete="new-password"
                                            minLength={8}
                                            onChange={(event) =>
                                                setProfile((value) => ({
                                                    ...value,
                                                    password_confirmation: event.target.value,
                                                }))
                                            }
                                            type="password"
                                            value={profile.password_confirmation}
                                        />
                                    </Field>
                                </div>
                            </section>
                            <SaveBar label="Save profile" saving={saving} />
                        </form>
                    ) : null}

                    {!loading && section === 'branding' ? (
                        <form onSubmit={saveApplication}>
                            <SettingsHeading
                                eyebrow="Brand system"
                                title="Business branding"
                                description="Keep the admin console, sales workspace, browser, and invoices visually consistent."
                            />
                            <div className="settings-brand-grid">
                                <div className="settings-brand-fields">
                                    <section className="settings-subsection">
                                        <header>
                                            <Icon name="settings" size={17} />
                                            <div>
                                                <strong>Brand identity</strong>
                                                <small>
                                                    Business name, short description, and primary interface color.
                                                </small>
                                            </div>
                                        </header>
                                        <div className="settings-form-grid">
                                            <Field error={fieldError(fields, 'business_name')} label="Business name">
                                                <input
                                                    maxLength={120}
                                                    onChange={(event) =>
                                                        setSettings((value) => ({
                                                            ...value,
                                                            business_name: event.target.value,
                                                        }))
                                                    }
                                                    required
                                                    value={settings.business_name}
                                                />
                                            </Field>
                                            <Field
                                                error={fieldError(fields, 'business_tagline')}
                                                label="Business tagline"
                                            >
                                                <input
                                                    maxLength={160}
                                                    onChange={(event) =>
                                                        setSettings((value) => ({
                                                            ...value,
                                                            business_tagline: event.target.value,
                                                        }))
                                                    }
                                                    value={settings.business_tagline}
                                                />
                                            </Field>
                                            <Field
                                                className="is-full"
                                                error={fieldError(fields, 'primary_color')}
                                                label="Primary color"
                                            >
                                                <div className="settings-color-field">
                                                    <input
                                                        aria-label="Choose primary color"
                                                        onChange={(event) =>
                                                            setSettings((value) => ({
                                                                ...value,
                                                                primary_color: event.target.value,
                                                            }))
                                                        }
                                                        type="color"
                                                        value={settings.primary_color}
                                                    />
                                                    <input
                                                        aria-label="Primary color hex value"
                                                        onChange={(event) =>
                                                            setSettings((value) => ({
                                                                ...value,
                                                                primary_color: event.target.value,
                                                            }))
                                                        }
                                                        pattern="#[0-9a-fA-F]{6}"
                                                        value={settings.primary_color}
                                                    />
                                                </div>
                                            </Field>
                                        </div>
                                    </section>
                                    <section className="settings-subsection">
                                        <header>
                                            <Icon name="box" size={17} />
                                            <div>
                                                <strong>Brand assets</strong>
                                                <small>PNG, JPG, or WebP. Logo up to 2 MB; favicon up to 1 MB.</small>
                                            </div>
                                        </header>
                                        <div className="settings-assets">
                                            <AssetPicker
                                                accept="image/png,image/jpeg,image/webp"
                                                file={settings.logo}
                                                label="Logo"
                                                onChange={(file) =>
                                                    setSettings((value) => ({
                                                        ...value,
                                                        logo: file,
                                                        remove_logo: false,
                                                    }))
                                                }
                                                onRemove={() =>
                                                    setSettings((value) => ({
                                                        ...value,
                                                        logo: null,
                                                        remove_logo: true,
                                                    }))
                                                }
                                                preview={logoPreview}
                                            />
                                            <AssetPicker
                                                accept="image/png,image/jpeg,image/webp"
                                                file={settings.favicon}
                                                label="Favicon"
                                                onChange={(file) =>
                                                    setSettings((value) => ({
                                                        ...value,
                                                        favicon: file,
                                                        remove_favicon: false,
                                                    }))
                                                }
                                                onRemove={() =>
                                                    setSettings((value) => ({
                                                        ...value,
                                                        favicon: null,
                                                        remove_favicon: true,
                                                    }))
                                                }
                                                preview={faviconPreview}
                                            />
                                        </div>
                                    </section>
                                </div>
                                <BrandPreview
                                    color={settings.primary_color}
                                    logo={logoPreview}
                                    name={settings.business_name}
                                />
                            </div>
                            <SaveBar label="Save branding" saving={saving} />
                        </form>
                    ) : null}

                    {!loading && section === 'operations' ? (
                        <form onSubmit={saveApplication}>
                            <SettingsHeading
                                eyebrow="Business defaults"
                                title="Operational defaults"
                                description="Set the contact information and defaults used throughout daily operations."
                            />
                            <section className="settings-subsection">
                                <header>
                                    <Icon name="building" size={17} />
                                    <div>
                                        <strong>Business contact</strong>
                                        <small>Used on invoices and administrative records.</small>
                                    </div>
                                </header>
                                <div className="settings-form-grid">
                                    <Field error={fieldError(fields, 'business_email')} label="Business email">
                                        <input
                                            onChange={(event) =>
                                                setSettings((value) => ({
                                                    ...value,
                                                    business_email: event.target.value,
                                                }))
                                            }
                                            type="email"
                                            value={settings.business_email}
                                        />
                                    </Field>
                                    <Field error={fieldError(fields, 'business_phone')} label="Business phone">
                                        <input
                                            onChange={(event) =>
                                                setSettings((value) => ({
                                                    ...value,
                                                    business_phone: event.target.value,
                                                }))
                                            }
                                            value={settings.business_phone}
                                        />
                                    </Field>
                                    <Field
                                        className="is-full"
                                        error={fieldError(fields, 'business_address')}
                                        label="Business address"
                                    >
                                        <textarea
                                            maxLength={500}
                                            onChange={(event) =>
                                                setSettings((value) => ({
                                                    ...value,
                                                    business_address: event.target.value,
                                                }))
                                            }
                                            rows={3}
                                            value={settings.business_address}
                                        />
                                    </Field>
                                </div>
                            </section>
                            <section className="settings-subsection">
                                <header>
                                    <Icon name="adjustments" size={17} />
                                    <div>
                                        <strong>Application defaults</strong>
                                        <small>Currency, local time, stock alerts, and invoice message.</small>
                                    </div>
                                </header>
                                <div className="settings-form-grid">
                                    <Field error={fieldError(fields, 'currency_code')} label="Currency">
                                        <select
                                            onChange={(event) =>
                                                setSettings((value) => ({
                                                    ...value,
                                                    currency_code: event.target.value,
                                                }))
                                            }
                                            value={settings.currency_code}
                                        >
                                            <option value="MMK">MMK — Myanmar Kyat</option>
                                            <option value="USD">USD — US Dollar</option>
                                            <option value="THB">THB — Thai Baht</option>
                                            <option value="CNY">CNY — Chinese Yuan</option>
                                        </select>
                                    </Field>
                                    <Field error={fieldError(fields, 'timezone')} label="Timezone">
                                        <select
                                            onChange={(event) =>
                                                setSettings((value) => ({ ...value, timezone: event.target.value }))
                                            }
                                            value={settings.timezone}
                                        >
                                            <option value="Asia/Yangon">Asia/Yangon (UTC+06:30)</option>
                                            <option value="Asia/Bangkok">Asia/Bangkok (UTC+07:00)</option>
                                            <option value="Asia/Singapore">Asia/Singapore (UTC+08:00)</option>
                                            <option value="UTC">UTC</option>
                                        </select>
                                    </Field>
                                    <Field
                                        error={fieldError(fields, 'low_stock_threshold')}
                                        label="Low-stock threshold"
                                    >
                                        <input
                                            min={0}
                                            onChange={(event) =>
                                                setSettings((value) => ({
                                                    ...value,
                                                    low_stock_threshold: Number(event.target.value),
                                                }))
                                            }
                                            required
                                            type="number"
                                            value={settings.low_stock_threshold}
                                        />
                                    </Field>
                                    <Field
                                        className="is-full"
                                        error={fieldError(fields, 'invoice_footer')}
                                        label="Invoice footer"
                                    >
                                        <textarea
                                            maxLength={500}
                                            onChange={(event) =>
                                                setSettings((value) => ({
                                                    ...value,
                                                    invoice_footer: event.target.value,
                                                }))
                                            }
                                            placeholder="Thank you for your business."
                                            rows={3}
                                            value={settings.invoice_footer}
                                        />
                                    </Field>
                                </div>
                            </section>
                            <SaveBar label="Save defaults" saving={saving} />
                        </form>
                    ) : null}
                    {!loading && section === 'roles' ? <RoleManagementSection /> : null}
                </main>
            </div>
        </div>
    );
}

function SettingsHeading({ description, eyebrow, title }: { description: string; eyebrow: string; title: string }) {
    return (
        <header className="settings-editor-heading">
            <p className="ui-eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p>{description}</p>
        </header>
    );
}

function Field({
    children,
    className = '',
    error,
    label,
}: {
    children: React.ReactNode;
    className?: string;
    error?: string;
    label: string;
}) {
    return (
        <label className={`ui-field settings-field ${className}`.trim()}>
            <span>{label}</span>
            {children}
            {error ? <small className="ui-field__error">{error}</small> : null}
        </label>
    );
}

function SaveBar({ label, saving }: { label: string; saving: boolean }) {
    return (
        <footer className="settings-save-bar">
            <span>Changes take effect across both portals after saving.</span>
            <Button disabled={saving} icon="check" requiresOnline tone="primary" type="submit">
                {saving ? 'Saving…' : label}
            </Button>
        </footer>
    );
}

function BrandPreview({ color, logo, name }: { color: string; logo: string | null; name: string }) {
    return (
        <aside className="settings-brand-preview">
            <header>
                <div>
                    <strong>Live preview</strong>
                    <small>Admin console</small>
                </div>
                <span>
                    <i style={{ background: color }} />
                    Primary
                </span>
            </header>
            <div className="settings-brand-preview__window">
                <div className="settings-brand-preview__top">
                    <span>{logo ? <img alt="" src={logo} /> : <Icon name="box" size={16} />}</span>
                    <strong>{name || 'Business name'}</strong>
                    <i />
                    <i />
                    <i />
                </div>
                <div className="settings-brand-preview__body">
                    <aside style={{ background: color }} />
                    <main>
                        <span />
                        <span />
                        <button style={{ background: color }} type="button">
                            Action
                        </button>
                    </main>
                </div>
            </div>
            <footer>
                <i style={{ background: color }} />
                <span>
                    <small>Primary token</small>
                    <strong>{color}</strong>
                </span>
            </footer>
        </aside>
    );
}
