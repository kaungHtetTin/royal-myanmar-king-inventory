import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import Root from './root';
import { appBasePath } from './config/runtime';
import { registerPwa } from './pwa';
import './bootstrap';

const container = document.getElementById('app');

if (!container) {
    throw new Error('Application root element was not found.');
}

registerPwa();

createRoot(container).render(
    <StrictMode>
        <BrowserRouter basename={appBasePath}>
            <Root />
        </BrowserRouter>
    </StrictMode>,
);
