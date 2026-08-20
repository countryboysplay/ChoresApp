import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { registerServiceWorker } from './lib/serviceWorker';
import './styles/global.css';
import './design/system.css';

// HashRouter: GitHub Pages has no server-side rewrite, so deep links must live
// after the hash to survive a refresh.
const container = document.getElementById('root');
if (!container) throw new Error('Root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
);

// After the app is handed to React, so the worker never competes with first
// paint. What it caches is for the next launch, not this one.
registerServiceWorker();
