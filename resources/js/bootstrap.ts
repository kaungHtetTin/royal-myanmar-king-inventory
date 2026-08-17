import axios from 'axios';
import { toAppUrl } from './config/runtime';
import { OFFLINE_TRANSACTION_MESSAGE } from './ui/offline-banner';

declare global {
    interface Window {
        axios: typeof axios;
    }
}

window.axios = axios;
window.axios.defaults.baseURL = toAppUrl('/');
window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
window.axios.defaults.headers.common.Accept = 'application/json';
window.axios.defaults.withCredentials = true;
window.axios.defaults.withXSRFToken = true;

window.axios.interceptors.request.use((config) => {
    const method = config.method?.toUpperCase() ?? 'GET';
    if (!navigator.onLine && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        return Promise.reject(
            new axios.AxiosError(OFFLINE_TRANSACTION_MESSAGE, 'OFFLINE_MUTATION_BLOCKED', config, undefined, {
                config,
                data: {
                    code: 'OFFLINE_MUTATION_BLOCKED',
                    message: OFFLINE_TRANSACTION_MESSAGE,
                },
                headers: {},
                status: 503,
                statusText: 'Service Unavailable',
            }),
        );
    }

    return config;
});
