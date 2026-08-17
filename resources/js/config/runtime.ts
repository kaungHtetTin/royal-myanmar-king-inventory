export function normalizeBasePath(value: string | null | undefined): string {
    const segments = (value ?? '').trim().split('/').filter(Boolean);

    return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function joinBasePath(basePath: string, path: string): string {
    const base = normalizeBasePath(basePath);
    const suffix = path.trim().replace(/^\/+/, '');

    if (base === '/') {
        return suffix === '' ? '/' : `/${suffix}`;
    }

    return suffix === '' ? `${base}/` : `${base}/${suffix}`;
}

export function readAppBasePath(documentRoot: Document = document): string {
    const configuredPath = documentRoot
        .querySelector<HTMLMetaElement>('meta[name="app-base-path"]')
        ?.getAttribute('content');

    return normalizeBasePath(configuredPath);
}

export const appBasePath = readAppBasePath();

export function toAppUrl(path: string): string {
    return joinBasePath(appBasePath, path);
}
