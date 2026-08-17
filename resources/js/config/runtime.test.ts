import { describe, expect, it } from 'vitest';
import { joinBasePath, normalizeBasePath, readAppBasePath } from './runtime';

describe('deployment base path', () => {
    it.each([
        [null, '/'],
        ['', '/'],
        ['/', '/'],
        ['/inventory/public', '/inventory/public'],
        ['/inventory/public/', '/inventory/public'],
        ['inventory/public', '/inventory/public'],
    ])('normalizes %s to %s', (input, expected) => {
        expect(normalizeBasePath(input)).toBe(expected);
    });

    it('joins application paths at the domain root', () => {
        expect(joinBasePath('/', '/api/health')).toBe('/api/health');
        expect(joinBasePath('/', '/')).toBe('/');
    });

    it('joins application paths below a deployment directory', () => {
        expect(joinBasePath('/inventory/public', '/api/health')).toBe('/inventory/public/api/health');
        expect(joinBasePath('/inventory/public', '/')).toBe('/inventory/public/');
    });

    it('reads the deployment directory supplied by Laravel', () => {
        document.head.innerHTML = '<meta name="app-base-path" content="/inventory/public/">';

        expect(readAppBasePath()).toBe('/inventory/public');
    });
});
