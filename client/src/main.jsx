// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/brigade.css';

createRoot(document.getElementById('ui')).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err.message));
  });
}
