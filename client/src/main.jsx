// main.jsx: browser entry point. Mounts <App /> into the #ui element of index.html,
// loads the global styles, and registers the service worker (offline page) in production.
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/brigade.css';
import './styles/logo.css';

createRoot(document.getElementById('ui')).render(<App />);

// Only register the service worker in the production build, after the page has loaded,
// so it never caches files while developing with Vite.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err.message));
  });
}
