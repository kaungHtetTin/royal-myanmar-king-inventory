import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from './locale-provider';
import { useLocale } from './locale-context';

function Probe() {
    const { formatNumber, locale, setLocale, t } = useLocale();

    return (
        <div>
            <span>{locale}</span>
            <span>{t('Customers')}</span>
            <span>{formatNumber(1234)}</span>
            <button onClick={() => setLocale('my')}>Myanmar</button>
        </div>
    );
}

describe('LocaleProvider', () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.lang = 'en';
        delete document.documentElement.dataset.locale;
    });

    it('defaults to English and persists a Myanmar selection for the device', () => {
        render(
            <LocaleProvider>
                <Probe />
            </LocaleProvider>,
        );

        expect(screen.getByText('Customers')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Myanmar' }));

        expect(screen.getByText('ဖောက်သည်များ')).toBeInTheDocument();
        expect(window.localStorage.getItem('inventory.locale')).toBe('my');
        expect(document.documentElement).toHaveAttribute('lang', 'my');
        expect(document.documentElement).toHaveAttribute('data-locale', 'my');
    });

    it('restores the stored locale', () => {
        window.localStorage.setItem('inventory.locale', 'my');

        render(
            <LocaleProvider>
                <Probe />
            </LocaleProvider>,
        );

        expect(screen.getByText('ဖောက်သည်များ')).toBeInTheDocument();
    });
});
