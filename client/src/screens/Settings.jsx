// Settings, saved in this browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Panel } from './common.jsx';

const OPTIONS = [['sound', 'Sound effects'], ['laser', 'Sight laser'], ['banners', 'Kill-streak banners'], ['fps', 'Show FPS (smoothness check)']];

// The Banana API connection, explained in plain words (the server fetches puzzles
// in advance and keeps a reserve for when the API is down).
function useApiStatus() {
  const [s, setS] = useState(null);
  useEffect(() => { api.status().then(setS).catch(() => setS({ online: false, ready: 0, reserve: 0 })); }, []);
  if (!s) return 'Checking…';
  if (s.online === false) return `Offline · ${s.reserve} reserve puzzles keep the game going`;
  return `Online · ${s.ready} puzzles ready`;
}

export default function Settings({ settings, onToggle, onControls, onLogout, onBack }) {
  const apiStatus = useApiStatus();
  return (
    <Panel title="Settings" subtitle="Saved in this browser." footer={<>
      <button className="mbtn ghost" onClick={onLogout}>Log out</button>
      <button className="mbtn primary" onClick={onBack}>Back</button>
    </>}>
      <div className="settings-list">
        {OPTIONS.map(([key, label]) => (
          <div className="setting" key={key}>
            <span>{label}</span>
            <button className="toggle" aria-pressed={settings[key]} onClick={() => onToggle(key)}>{settings[key] ? 'On' : 'Off'}</button>
          </div>
        ))}
        <div className="setting"><span>Banana API</span><span className="setting-note">{apiStatus}</span></div>
        <div className="setting"><span>Controls</span><button className="toggle" onClick={onControls}>View</button></div>
      </div>
    </Panel>
  );
}
