import { afterEach, describe, expect, it } from 'vitest';
import { OFFLINE_TRANSACTION_MESSAGE } from './ui/offline-banner';
import './bootstrap';

function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value,
    });
}

describe('offline network safety', () => {
    afterEach(() => setOnline(true));

    it('blocks mutations before the transport while preserving reads', async () => {
        let transportCalls = 0;
        // Use the configured application client so this verifies the production interceptor.
        const adapter = window.axios.defaults.adapter;
        window.axios.defaults.adapter = async (config) => {
            transportCalls += 1;
            return {
                config,
                data: { ok: true },
                headers: {},
                status: 200,
                statusText: 'OK',
            };
        };
        setOnline(false);

        await expect(window.axios.post('api/sales/sales', {})).rejects.toMatchObject({
            code: 'OFFLINE_MUTATION_BLOCKED',
            message: OFFLINE_TRANSACTION_MESSAGE,
            response: { status: 503 },
        });
        expect(transportCalls).toBe(0);
        await expect(window.axios.get('api/sales/dashboard')).resolves.toMatchObject({ status: 200 });
        expect(transportCalls).toBe(1);
        window.axios.defaults.adapter = adapter;
    });
});
