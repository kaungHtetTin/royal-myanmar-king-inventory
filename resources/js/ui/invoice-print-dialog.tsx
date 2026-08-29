import { useState } from 'react';
import { useSession } from '../auth/session-context';
import { useBranding } from '../branding/branding-context';
import {
    invoicePaperSizes,
    printInvoice,
    type InvoicePaperSize,
} from '../services/invoice-print';
import {
    configuredInvoicePaperSize,
    invoicePaperPreferenceKey,
    preferredInvoicePaperSize,
} from '../services/invoice-print-preferences';
import type { Sale } from '../services/sales';
import { Icon } from './icons';
import { Button, Dialog, IconButton } from './primitives';

function PaperSizeOptions({
    name,
    onChange,
    paperSize,
}: {
    name: string;
    onChange: (value: InvoicePaperSize) => void;
    paperSize: InvoicePaperSize;
}) {
    return (
        <fieldset className="invoice-paper-options">
            <legend>Paper size</legend>
            {invoicePaperSizes.map((option) => (
                <label className={paperSize === option.value ? 'is-selected' : ''} key={option.value}>
                    <input
                        aria-label={`${option.label}, ${option.description}`}
                        checked={paperSize === option.value}
                        name={name}
                        onChange={() => onChange(option.value)}
                        type="radio"
                        value={option.value}
                    />
                    <span aria-hidden="true" className={`invoice-paper-swatch invoice-paper-swatch--${option.value}`} />
                    <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
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
    const [open, setOpen] = useState(false);
    const [paperSize, setPaperSize] = useState<InvoicePaperSize>(() => preferredInvoicePaperSize(user?.id ?? 0));
    const [setAsDefault, setSetAsDefault] = useState(false);

    const startPrint = () => {
        const userId = user?.id ?? 0;
        const defaultSize = configuredInvoicePaperSize(userId);
        if (defaultSize) {
            if (!printInvoice(sale, branding, defaultSize)) onBlocked();
            return;
        }
        setPaperSize('a4');
        setSetAsDefault(false);
        setOpen(true);
    };
    const submit = () => {
        if (setAsDefault) window.localStorage.setItem(invoicePaperPreferenceKey(user?.id ?? 0), paperSize);
        setOpen(false);
        if (!printInvoice(sale, branding, paperSize)) onBlocked();
    };

    return (
        <>
            {iconOnly ? (
                <IconButton icon="print" label={`Print invoice ${sale.reference}`} onClick={startPrint} />
            ) : (
                <Button icon="print" onClick={startPrint}>
                    Print invoice
                </Button>
            )}
            <Dialog
                description={`Choose the paper loaded in the printer for invoice ${sale.reference}.`}
                footer={
                    <>
                        <Button onClick={() => setOpen(false)}>Cancel</Button>
                        <Button icon="print" onClick={submit} tone="primary">
                            Print on {invoicePaperSizes.find((option) => option.value === paperSize)?.label}
                        </Button>
                    </>
                }
                onClose={() => setOpen(false)}
                open={open}
                title="Select paper size"
                width="compact"
            >
                <PaperSizeOptions
                    name={`invoice-paper-${sale.id}`}
                    onChange={setPaperSize}
                    paperSize={paperSize}
                />
                <label className="invoice-default-choice">
                    <input
                        checked={setAsDefault}
                        onChange={(event) => setSetAsDefault(event.target.checked)}
                        type="checkbox"
                    />
                    <span>
                        <strong>Use as my default on this device</strong>
                        <small>Future invoices will print immediately with this paper size.</small>
                    </span>
                </label>
            </Dialog>
        </>
    );
}

function PrintSettingsDialogContent({ onClose }: { onClose: () => void }) {
    const { user } = useSession();
    const userId = user?.id ?? 0;
    const [paperSize, setPaperSize] = useState<InvoicePaperSize>(() => preferredInvoicePaperSize(userId));

    const save = () => {
        window.localStorage.setItem(invoicePaperPreferenceKey(userId), paperSize);
        onClose();
    };

    return (
        <Dialog
            description="This default is saved for your account on this device only. You can still choose another size before printing."
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button onClick={save} tone="primary">
                        Save default
                    </Button>
                </>
            }
            onClose={onClose}
            open
            title="Print settings"
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
                    <strong>Personal device preference</strong>
                    <small>
                        Saved for {user?.name ?? 'this user'} in this browser. Other users and devices keep their own
                        defaults.
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
                <span aria-live="polite">{saved ? 'Default paper size saved on this device.' : 'Used by both portals on this device.'}</span>
                <Button icon="check" tone="primary" type="submit">
                    Save printing default
                </Button>
            </footer>
        </form>
    );
}
