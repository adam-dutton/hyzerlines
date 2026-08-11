import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * Inter, bundled rather than fetched.
 *
 * One variable file covers every weight the interface uses, which is why this is
 * a single import and not four. It comes before the stylesheet so the
 * `@font-face` rules land ahead of the `font-family` that asks for them.
 */
import '@fontsource-variable/inter';

import './styles/global.css';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
