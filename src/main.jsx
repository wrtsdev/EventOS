import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { StoreProvider } from './store.jsx';
// Fonts are served from this site (no Google Fonts request blocking the first paint).
import '@fontsource/figtree/latin-400';
import '@fontsource/figtree/latin-500';
import '@fontsource/figtree/latin-600';
import '@fontsource/figtree/latin-700';
import '@fontsource/big-shoulders-display/latin-600';
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/big-shoulders-display/latin-900';
import './styles.css';
import { initNative } from './native.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

initNative();
