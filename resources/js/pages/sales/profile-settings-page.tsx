import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import {
    salesProfileApi,
    SalesProfileError,
    type SalesProfile,
    type SalesProfileInput,
} from '../../services/sales-profile';
import { Icon } from '../../ui/icons';
import { Button, StatusBadge } from '../../ui/primitives';

const emptyProfile: SalesProfileInput = { email: '', name: '', phone: '', region: '', username: '' };
const emptyPassword = { current_password: '', password: '', password_confirmation: '' };
const fieldError = (fields: Record<string, string[]>, name: string) => fields[name]?.[0];

export function ProfileSettingsPage() {
    const { updateUser } = useSession();
    const [record, setRecord] = useState<SalesProfile | null>(null);
    const [profile, setProfile] = useState(emptyProfile);
    const [password, setPassword] = useState(emptyPassword);
    const [loading, setLoading] = useState(true);
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingPassword, setSavingPassword] = useState(false);
    const [profileErrors, setProfileErrors] = useState<Record<string, string[]>>({});
    const [passwordErrors, setPasswordErrors] = useState<Record<string, string[]>>({});
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let active = true;
        void salesProfileApi
            .get()
            .then(({ representative }) => {
                if (!active) return;
                setRecord(representative);
                setProfile({
                    email: representative.account.email ?? representative.email ?? '',
                    name: representative.account.name,
                    phone: representative.phone ?? '',
                    region: representative.region ?? '',
                    username: representative.account.username,
                });
            })
            .catch((requestError) => {
                if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load profile.');
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const showNotice = (value: string) => {
        setNotice(value);
        window.setTimeout(() => setNotice(''), 4000);
    };
    const saveProfile = async (event: FormEvent) => {
        event.preventDefault();
        setSavingProfile(true);
        setProfileErrors({});
        setError('');
        try {
            const response = await salesProfileApi.update(profile);
            setRecord(response.representative);
            updateUser({ email: response.user.email, name: response.user.name, username: response.user.username });
            showNotice('Profile information updated.');
        } catch (requestError) {
            const failure =
                requestError instanceof SalesProfileError
                    ? requestError
                    : new SalesProfileError('Unable to update your profile.');
            setProfileErrors(failure.fields);
            setError(failure.message);
        } finally {
            setSavingProfile(false);
        }
    };
    const savePassword = async (event: FormEvent) => {
        event.preventDefault();
        setSavingPassword(true);
        setPasswordErrors({});
        setError('');
        try {
            await salesProfileApi.updatePassword(password);
            setPassword(emptyPassword);
            showNotice('Password updated successfully.');
        } catch (requestError) {
            const failure =
                requestError instanceof SalesProfileError
                    ? requestError
                    : new SalesProfileError('Unable to update your password.');
            setPasswordErrors(failure.fields);
            setError(failure.message);
        } finally {
            setSavingPassword(false);
        }
    };

    return (
        <div className="sales-profile-settings-page">
            <header className="sales-page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/sales/dashboard">
                        <Icon name="chevronLeft" size={13} />
                        Dashboard
                    </Link>
                    <p className="ui-eyebrow">Account settings</p>
                    <h1>Profile &amp; security</h1>
                    <p>Keep your personal information and login credentials current.</p>
                </div>
                {record ? <StatusBadge tone="success">Active · {record.code}</StatusBadge> : null}
            </header>

            {notice ? <div className="ui-flash ui-flash--success">{notice}</div> : null}
            {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
            {loading ? (
                <div className="ui-loading" role="status">
                    <span />
                    Loading profile…
                </div>
            ) : (
                <div className="sales-profile-settings-grid">
                    <form className="sales-section sales-profile-settings-form" onSubmit={saveProfile}>
                        <header>
                            <div>
                                <p className="ui-eyebrow">Profile information</p>
                                <h2>Personal details</h2>
                            </div>
                        </header>
                        <div className="sales-profile-settings-form__body">
                            <div className="sales-profile-form-grid">
                                <ProfileField error={fieldError(profileErrors, 'name')} label="Display name">
                                    <input
                                        autoComplete="name"
                                        onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                                        required
                                        value={profile.name}
                                    />
                                </ProfileField>
                                <ProfileField error={fieldError(profileErrors, 'username')} label="Username">
                                    <input
                                        autoComplete="username"
                                        onChange={(event) => setProfile({ ...profile, username: event.target.value })}
                                        required
                                        value={profile.username}
                                    />
                                </ProfileField>
                                <ProfileField error={fieldError(profileErrors, 'email')} label="Email address">
                                    <input
                                        autoComplete="email"
                                        onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                                        type="email"
                                        value={profile.email}
                                    />
                                </ProfileField>
                                <ProfileField error={fieldError(profileErrors, 'phone')} label="Phone number">
                                    <input
                                        autoComplete="tel"
                                        onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                                        value={profile.phone}
                                    />
                                </ProfileField>
                                <ProfileField error={fieldError(profileErrors, 'region')} label="Region">
                                    <input
                                        onChange={(event) => setProfile({ ...profile, region: event.target.value })}
                                        value={profile.region}
                                    />
                                </ProfileField>
                                <ProfileField label="Assigned warehouse">
                                    <input disabled value={record?.primary_warehouse.name ?? '—'} />
                                </ProfileField>
                            </div>
                        </div>
                        <footer>
                            <Button disabled={savingProfile} requiresOnline tone="primary" type="submit">
                                {savingProfile ? 'Saving…' : 'Save profile'}
                            </Button>
                        </footer>
                    </form>

                    <form className="sales-section sales-profile-settings-form" onSubmit={savePassword}>
                        <header>
                            <div>
                                <p className="ui-eyebrow">Security</p>
                                <h2>Change password</h2>
                            </div>
                        </header>
                        <div className="sales-profile-settings-form__body">
                            <p className="sales-profile-security-note">
                                Use at least 6 characters. Your current password is required to confirm this change.
                            </p>
                            <ProfileField
                                error={fieldError(passwordErrors, 'current_password')}
                                label="Current password"
                            >
                                <input
                                    autoComplete="current-password"
                                    minLength={6}
                                    onChange={(event) =>
                                        setPassword({ ...password, current_password: event.target.value })
                                    }
                                    required
                                    type="password"
                                    value={password.current_password}
                                />
                            </ProfileField>
                            <ProfileField error={fieldError(passwordErrors, 'password')} label="New password">
                                <input
                                    autoComplete="new-password"
                                    minLength={6}
                                    onChange={(event) => setPassword({ ...password, password: event.target.value })}
                                    required
                                    type="password"
                                    value={password.password}
                                />
                            </ProfileField>
                            <ProfileField
                                error={fieldError(passwordErrors, 'password_confirmation')}
                                label="Confirm new password"
                            >
                                <input
                                    autoComplete="new-password"
                                    minLength={6}
                                    onChange={(event) =>
                                        setPassword({ ...password, password_confirmation: event.target.value })
                                    }
                                    required
                                    type="password"
                                    value={password.password_confirmation}
                                />
                            </ProfileField>
                        </div>
                        <footer>
                            <Button disabled={savingPassword} requiresOnline tone="primary" type="submit">
                                {savingPassword ? 'Updating…' : 'Update password'}
                            </Button>
                        </footer>
                    </form>
                </div>
            )}
        </div>
    );
}

function ProfileField({ children, error, label }: { children: ReactNode; error?: string; label: string }) {
    return (
        <label className="ui-field">
            <span>{label}</span>
            {children}
            {error ? <small className="ui-field__error">{error}</small> : null}
        </label>
    );
}
