// Starts the React app inside #ui.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/brigade.css';

createRoot(document.getElementById('ui')).render(<App />);
