import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './icons';
import { OFFLINE_TRANSACTION_MESSAGE } from './offline-banner';
import { useOnlineStatus } from './preferences';
import type { PaginationMeta } from '../services/administration';
import { useLocale } from '../localization/locale-context';

type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: IconName;
    requiresOnline?: boolean;
    tone?: ButtonTone;
};

export function Button({
    children,
    className = '',
    disabled,
    icon,
    requiresOnline = false,
    title,
    tone = 'secondary',
    type = 'button',
    ...props
}: ButtonProps) {
    const online = useOnlineStatus();
    const { t } = useLocale();
    const offlineDisabled = requiresOnline && !online;
    return (
        <button
            className={`ui-button ui-button--${tone} ${className}`.trim()}
            disabled={disabled || offlineDisabled}
            title={offlineDisabled ? t(OFFLINE_TRANSACTION_MESSAGE) : title}
            type={type}
            {...props}
        >
            {icon ? <Icon name={icon} size={16} /> : null}
            <span>{children}</span>
        </button>
    );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: IconName;
    label: string;
    requiresOnline?: boolean;
    tone?: ButtonTone;
};

export function IconButton({
    className = '',
    disabled,
    icon,
    label,
    requiresOnline = false,
    tone = 'secondary',
    type = 'button',
    ...props
}: IconButtonProps) {
    const online = useOnlineStatus();
    const { t } = useLocale();
    const offlineDisabled = requiresOnline && !online;
    return (
        <button
            aria-label={label}
            className={`ui-icon-button ui-icon-button--${tone} ${className}`.trim()}
            disabled={disabled || offlineDisabled}
            title={offlineDisabled ? t(OFFLINE_TRANSACTION_MESSAGE) : label}
            type={type}
            {...props}
        >
            <Icon name={icon} />
        </button>
    );
}

type IconLinkProps = Omit<LinkProps, 'children'> & {
    icon: IconName;
    label: string;
    tone?: ButtonTone;
};

export function IconLink({ className = '', icon, label, tone = 'secondary', ...props }: IconLinkProps) {
    return (
        <Link
            aria-label={label}
            className={`ui-icon-button ui-icon-button--${tone} ${className}`.trim()}
            title={label}
            {...props}
        >
            <Icon name={icon} />
        </Link>
    );
}

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function StatusBadge({ children, tone }: { children: ReactNode; tone: BadgeTone }) {
    return (
        <span className={`ui-badge ui-badge--${tone}`}>
            <span className="ui-badge__dot" aria-hidden="true" />
            {children}
        </span>
    );
}

type PanelProps = {
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    eyebrow?: string;
    title: string;
};

export function Panel({ actions, children, className = '', eyebrow, title }: PanelProps) {
    return (
        <section className={`ui-panel ${className}`.trim()}>
            <header className="ui-panel__header">
                <div>
                    {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
                    <h2>{title}</h2>
                </div>
                {actions ? <div className="ui-panel__actions">{actions}</div> : null}
            </header>
            <div className="ui-panel__body">{children}</div>
        </section>
    );
}

type MetricCardProps = {
    hint: string;
    icon: IconName;
    label: string;
    value: string;
};

export function MetricCard({ hint, icon, label, value }: MetricCardProps) {
    return (
        <article className="metric-card">
            <div className="metric-card__icon">
                <Icon name={icon} size={16} />
            </div>
            <p>{label}</p>
            <strong>{value}</strong>
            <small>{hint}</small>
        </article>
    );
}

export function EmptyState({ description, title }: { description: string; title: string }) {
    return (
        <div className="ui-empty-state">
            <span className="ui-empty-state__icon">
                <Icon name="box" />
            </span>
            <strong>{title}</strong>
            <p>{description}</p>
        </div>
    );
}

export function Pagination({
    label,
    loading,
    meta,
    onPageChange,
}: {
    label: string;
    loading: boolean;
    meta: PaginationMeta;
    onPageChange: (page: number) => void;
}) {
    const { formatNumber, t } = useLocale();

    if (meta.total === 0) return null;

    return (
        <nav aria-label={t('{label} pagination', { label })} className="table-footer">
            <span>
                {t('{from}–{to} of {total}', {
                    from: formatNumber(meta.from ?? 0),
                    to: formatNumber(meta.to ?? 0),
                    total: formatNumber(meta.total),
                })}
            </span>
            <button
                disabled={meta.current_page <= 1 || loading}
                onClick={() => onPageChange(meta.current_page - 1)}
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
                onClick={() => onPageChange(meta.current_page + 1)}
                type="button"
            >
                {t('Next')}
            </button>
        </nav>
    );
}

type DialogProps = {
    children: ReactNode;
    description?: string;
    footer: ReactNode;
    onClose: () => void;
    open: boolean;
    title: string;
    width?: 'compact' | 'standard' | 'wide';
};

export function Dialog({ children, description, footer, onClose, open, title, width = 'standard' }: DialogProps) {
    const { t } = useLocale();
    const dialogRef = useRef<HTMLElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const descriptionId = useId();
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);
    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onCloseRef.current();
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
                ),
            );
            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', closeOnEscape);
        window.requestAnimationFrame(() => {
            const preferred = dialogRef.current?.querySelector<HTMLElement>(
                '[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
            );
            (preferred ?? dialogRef.current)?.focus();
        });
        return () => {
            document.body.style.overflow = overflow;
            window.removeEventListener('keydown', closeOnEscape);
            previousFocus?.focus();
        };
    }, [open]);

    if (!open) return null;

    const portalRoot = document.querySelector<HTMLElement>('.admin-root, .sales-root') ?? document.body;

    return createPortal(
        <div
            className="ui-dialog-backdrop"
            onMouseDown={(event) => {
                if (event.currentTarget === event.target) onClose();
            }}
        >
            <section
                aria-describedby={description ? descriptionId : undefined}
                aria-labelledby={titleId}
                aria-modal="true"
                className={`ui-dialog ui-dialog--${width}`}
                ref={dialogRef}
                role="dialog"
                tabIndex={-1}
            >
                <header className="ui-dialog__header">
                    <div>
                        <h2 id={titleId}>{title}</h2>
                        {description ? <p id={descriptionId}>{description}</p> : null}
                    </div>
                    <IconButton icon="x" label={t('Close dialog')} onClick={onClose} />
                </header>
                <div className="ui-dialog__body">{children}</div>
                <footer className="ui-dialog__footer">{footer}</footer>
            </section>
        </div>,
        portalRoot,
    );
}

type DrawerProps = {
    children: ReactNode;
    description?: string;
    footer?: ReactNode;
    onClose: () => void;
    open: boolean;
    title: string;
};

export function Drawer({ children, description, footer, onClose, open, title }: DrawerProps) {
    const { t } = useLocale();
    const drawerRef = useRef<HTMLElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const descriptionId = useId();
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return;
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onCloseRef.current();
                return;
            }
            if (event.key !== 'Tab' || !drawerRef.current) return;
            const focusable = Array.from(
                drawerRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
                ),
            );
            if (focusable.length === 0) {
                event.preventDefault();
                drawerRef.current.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        window.requestAnimationFrame(() => {
            const preferred = drawerRef.current?.querySelector<HTMLElement>(
                '[autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
            );
            (preferred ?? drawerRef.current)?.focus();
        });
        return () => {
            document.body.style.overflow = overflow;
            window.removeEventListener('keydown', handleKeyDown);
            previousFocus?.focus();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            className="ui-drawer-backdrop"
            onMouseDown={(event) => {
                if (event.currentTarget === event.target) onClose();
            }}
        >
            <aside
                aria-describedby={description ? descriptionId : undefined}
                aria-labelledby={titleId}
                aria-modal="true"
                className="ui-drawer"
                ref={drawerRef}
                role="dialog"
                tabIndex={-1}
            >
                <header className="ui-drawer__header">
                    <div>
                        <h2 id={titleId}>{title}</h2>
                        {description ? <p id={descriptionId}>{description}</p> : null}
                    </div>
                    <IconButton icon="x" label={t('Close drawer')} onClick={onClose} />
                </header>
                <div className="ui-drawer__body">{children}</div>
                {footer ? <footer className="ui-drawer__footer">{footer}</footer> : null}
            </aside>
        </div>
    );
}
