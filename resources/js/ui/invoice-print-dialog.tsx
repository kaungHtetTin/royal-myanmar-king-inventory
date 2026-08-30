import { useState } from 'react';
import { useSession } from '../auth/session-context';
import { useBranding } from '../branding/branding-context';
import { invoicePaperSizes, printInvoice, type InvoicePaperSize } from '../services/invoice-print';
import {
    configuredInvoicePaperSize,
    invoicePaperPreferenceKey,
    preferredInvoicePaperSize,
} from '../services/invoice-print-preferences';
import type { Sale } from '../services/sales';
import { Icon } from './icons';
import { Button, Dialog, IconButton } from './primitives';
import { useLocale } from '../localization/locale-context';

function PaperSizeOptions({
    name,
    onChange,
    paperSize,
}: {
    name: string;
    onChange: (value: InvoicePaperSize) => void;
    paperSize: InvoicePaperSize;
}) {
    const { t } = useLocale();

    return (
        <fieldset className="invoice-paper-options">
            <legend>{t('Paper size')}</legend>
            {invoicePaperSizes.map((option) => (
                <label className={paperSize === option.value ? 'is-selected' : ''} key={option.value}>
                    <input
                        aria-label={`${option.label}, ${t(option.description)}`}
                        checked={paperSize === option.value}
                        name={name}
                        onChange={() => onChange(option.value)}
                        type="radio"
                        value={option.value}
                    />
                    <span aria-hidden="true" className={`invoice-paper-swatch invoice-paper-swatch--${option.value}`} />
                    <span>
                        <strong>{option.label}</strong>
                        <small>{t(option.description)}</small>
                    </span>
                </label>
            ))}
        </fieldset>
    );
}

type InvoicePrintButtonProps = {
    iconOnly?: boolean;
    onBlocked: () => void;
    sale: Sale;
};

export function InvoicePrintButton({ iconOnly = false, onBlocked, sale }: InvoicePrintButtonProps) {
    const { branding } = useBranding();
    const { user } = useSession();
    const { locale, t } = useLocale();
    const [open, setOpen] = useState(false);
    const [paperSize, setPaperSize] = useState<InvoicePaperSize>(() => preferredInvoicePaperSize(user?.id ?? 0));
    const [setAsDefault, setSetAsDefault] = useState(false);

    const startPrint = () => {
        const userId = user?.id ?? 0;
        const defaultSize = configuredInvoicePaperSize(userId);
        if (defaultSize) {
            if (!printInvoice(sale, branding, defaultSize, locale)) onBlocked();
            return;
        }
        setPaperSize('a4');
        setSetAsDefault(false);
        setOpen(true);
    };
    const submit = () => {
        if (setAsDefault) window.localStorage.setItem(invoicePaperPreferenceKey(user?.id ?? 0), paperSize);
        setOpen(false);
        if (!printInvoice(sale, branding, paperSize, locale)) onBlocked();
    };

    return (
        <>
            {iconOnly ? (
                <IconButton
                    icon="print"
                    label={t('Print invoice {reference}', { reference: sale.reference })}
                    onClick={startPrint}
                />
            ) : (
                <Button icon="print" onClick={startPrint}>
                    {t('Print invoice')}
                </Button>
            )}
            <Dialog
                description={t('Choose the paper loaded in the printer for invoice {reference}.', {
                    reference: sale.reference,
                })}
                footer={
                    <>
                        <Button onClick={() => setOpen(false)}>{t('Cancel')}</Button>
                        <Button icon="print" onClick={submit} tone="primary">
                            {t('Print on {paper}', {
                                paper: invoicePaperSizes.find((option) => option.value === paperSize)?.label ?? '',
                            })}
                        </Button>
                    </>
                }
                onClose={() => setOpen(false)}
                open={open}
                title={t('Select paper size')}
                width="compact"
            >
                <PaperSizeOptions name={`invoice-paper-${sale.id}`} onChange={setPaperSize} paperSize={paperSize} />
                <label className="invoice-default-choice">
                    <input
                        checked={setAsDefault}
                        onChange={(event) => setSetAsDefault(event.target.checked)}
                        type="checkbox"
                    />
                    <span>
                        <strong>{t('Use as my default on this device')}</strong>
                        <small>{t('Future invoices will print immediately with this paper size.')}</small>
                    </span>
                </label>
            </Dialog>
        </>
    );
}

function PrintSettingsDialogContent({ onClose }: { onClose: () => void }) {
    const { user } = useSession();
    const { t } = useLocale();
    const userId = user?.id ?? 0;
    const [paperSize, setPaperSize] = useState<InvoicePaperSize>(() => preferredInvoicePaperSize(userId));

    const save = () => {
        window.localStorage.setItem(invoicePaperPreferenceKey(userId), paperSize);
        onClose();
    };

    return (
        <Dialog
            description={t(
                'This default is saved for your account on this device only. You can still choose another size before printing.',
            )}
            footer={
                <>
                    <Button onClick={onClose}>{t('Cancel')}</Button>
                    <Button onClick={save} tone="primary">
                        {t('Save default')}
                    </Button>
                </>
            }
            onClose={onClose}
            open
            title={t('Print settings')}
            width="compact"
        >
            <PaperSizeOptions name={`default-invoice-paper-${userId}`} onChange={setPaperSize} paperSize={paperSize} />
        </Dialog>
    );
}

export function PrintSettingsDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
    return open ? <PrintSettingsDialogContent onClose={onClose} /> : null;
}

export function PrintSettingsForm() {
    const { user } = useSession();
    const { t } = useLocale();
    const userId = user?.id ?? 0;
    const [paperSize, setPaperSize] = useState<InvoicePaperSize>(() => preferredInvoicePaperSize(userId));
    const [saved, setSaved] = useState(false);

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                window.localStorage.setItem(invoicePaperPreferenceKey(userId), paperSize);
                setSaved(true);
            }}
        >
            <div className="print-settings-scope">
                <span aria-hidden="true">
                    <Icon name="print" size={17} />
                </span>
                <span>
                    <strong>{t('Personal device preference')}</strong>
                    <small>
                        {t('Saved for {user} in this browser. Other users and devices keep their own defaults.', {
                            user: user?.name ?? t('this user'),
                        })}
                    </small>
                </span>
            </div>
            <PaperSizeOptions
                name={`settings-invoice-paper-${userId}`}
                onChange={(value) => {
                    setPaperSize(value);
                    setSaved(false);
                }}
                paperSize={paperSize}
            />
            <footer className="settings-save-bar">
                <span aria-live="polite">
                    {t(saved ? 'Default paper size saved on this device.' : 'Used by both portals on this device.')}
                </span>
                <Button icon="check" tone="primary" type="submit">
                    {t('Save printing default')}
                </Button>
            </footer>
        </form>
    );
}
