import { toAppUrl } from './config/runtime';

export function registerPwa() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    window.addEventListener('load', () => {
        void navigator.serviceWorker.register(toAppUrl('/service-worker.js'), {
            scope: toAppUrl('/'),
            updateViaCache: 'none',
        });
    });
}
