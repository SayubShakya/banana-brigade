// Settings, saved in this browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Panel } from './common.jsx';
import { toggleFullscreen, useFullscreen } from '../fullscreen.js';

const OPTIONS = [['laser', 'Sight laser'], ['banners', 'Kill-streak banners'], ['fps', 'Show FPS (smoothness check)']];
const ACCESSIBILITY = [['contrast', 'High contrast'], ['largeText', 'Large text'], ['calm', 'Reduced motion']];
const VOLUMES = [['musicVolume', 'Music volume'], ['sfxVolume', 'Effects volume']];

// The Banana API connection, explained in plain words (the server fetches puzzles
// in advance and keeps a reserve for when the API is down).
function useApiStatus() {
  const [s, setS] = useState(null);
  useEffect(() => { api.status().then(setS).catch(() => setS({ online: false, ready: 0, reserve: 0 })); }, []);
  if (!s) return 'Checking…';
  if (s.online === false) return `Offline · ${s.reserve} reserve puzzles keep the game going`;
  return `Online · ${s.ready} puzzles ready`;
}

// One on/off switch row.
function Toggle({ label, value, onClick }) {
  return (
    <div className="setting">
      <span>{label}</span>
      <button className="toggle" aria-pressed={!!value} aria-label={label} onClick={onClick}>{value ? 'On' : 'Off'}</button>
    </div>
  );
}

export default function Settings({ settings, onToggle, onSet, onControls, onLogout, onBack }) {
  const apiStatus = useApiStatus();
  const [isFullscreen, canFullscreen] = useFullscreen();
  return (
    <Panel wide title="Settings" subtitle="Saved in this browser." footer={<>
      <button className="mbtn ghost" onClick={onLogout}>Log out</button>
      <button className="mbtn primary" onClick={onBack}>Back</button>
    </>}>
      <div className="settings-list cols">
        <h3 className="settings-group">Sound</h3>
        {VOLUMES.map(([key, label]) => (
          <div className="setting" key={key}>
            <label htmlFor={`set-${key}`}>{label}</label>
            <span className="slider">
              <input id={`set-${key}`} type="range" min="0" max="100" step="5" value={settings[key]} disabled={settings.muted}
                onChange={(e) => onSet(key, Number(e.target.value))} />
              <output htmlFor={`set-${key}`}>{settings[key]}</output>
            </span>
          </div>
        ))}
        <Toggle label="Mute all sound" value={settings.muted} onClick={() => onToggle('muted')} />
        <h3 className="settings-group">Game</h3>
        {OPTIONS.map(([key, label]) => <Toggle key={key} label={label} value={settings[key]} onClick={() => onToggle(key)} />)}
        <h3 className="settings-group">Accessibility</h3>
        {ACCESSIBILITY.map(([key, label]) => <Toggle key={key} label={label} value={settings[key]} onClick={() => onToggle(key)} />)}
        <h3 className="settings-group">More</h3>
        {canFullscreen && <Toggle label="Fullscreen" value={isFullscreen} onClick={toggleFullscreen} />}
        <div className="setting"><span>Banana API</span><span className="setting-note">{apiStatus}</span></div>
        <div className="setting"><span>Controls</span><button className="toggle" onClick={onControls}>View</button></div>
      </div>
    </Panel>
  );
}
