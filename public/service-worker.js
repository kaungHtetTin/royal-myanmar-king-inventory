const CACHE_VERSION = 'stockflow-shell-v2';
const scopeUrl = new URL(self.registration.scope);
const shellUrl = new URL('admin/login', scopeUrl).href;
const offlineAssets = [
    shellUrl,
    new URL('manifest.webmanifest', scopeUrl).href,
    new URL('icons/stockflow.svg', scopeUrl).href,
    new URL('icons/stockflow-maskable.svg', scopeUrl).href,
];

async function productionAssets() {
    try {
        const manifestUrl = new URL('build/manifest.json', scopeUrl).href;
        const response = await fetch(manifestUrl, { cache: 'no-store' });
        if (!response.ok) return [];

        const manifest = await response.json();
        const assets = new Set([manifestUrl]);
        Object.values(manifest).forEach((entry) => {
            if (entry.file) assets.add(new URL(`build/${entry.file}`, scopeUrl).href);
            (entry.css || []).forEach((file) => assets.add(new URL(`build/${file}`, scopeUrl).href));
        });

        return [...assets];
    } catch {
        return [];
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_VERSION);
        await cache.addAll([...offlineAssets, ...(await productionAssets())]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('stockflow-shell-') && key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) {
        return;
    }

    const relativePath = url.pathname.slice(scopeUrl.pathname.length);
    if (relativePath.startsWith('api/') || relativePath.startsWith('sanctum/')) {
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).then((response) => {
            if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
            return response;
        }).catch(async () => (await caches.match(request)) || (await caches.match(shellUrl))));
        return;
    }

    if (relativePath.startsWith('build/') || relativePath.startsWith('icons/') || relativePath === 'manifest.webmanifest') {
        event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
            if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
            return response;
        })));
    }
});
