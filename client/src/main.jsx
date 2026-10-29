// Starts the React app inside #ui.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/brigade.css';

createRoot(document.getElementById('ui')).render(<App />);

// The service worker makes the game installable and lets it open offline (see
// public/sw.js). Only in the built app: in development it would serve old files.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err.message));
  });
}
