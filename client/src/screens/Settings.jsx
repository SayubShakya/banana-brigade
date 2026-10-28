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
  if (!s) return { line: 'Checking…' };
  const line = s.circuit?.state === 'open'
    ? `Paused after repeated failures · trying again in ${Math.ceil(s.circuit.retryInMs / 1000)} s · ${s.reserve} reserve puzzles in use`
    : s.online === false ? `Offline · ${s.reserve} reserve puzzles keep the game going`
      : `Online · ${s.ready} puzzles ready`;
  return { line, health: describeHealth(s) };
}

// e.g. "Usually answers in 240 ms · 19 of the last 20 calls worked · 2 retries"
function describeHealth(s) {
  if (!s.calls) return 'No calls to the Banana API yet.';
  const worked = Math.round((s.successRate / 100) * s.calls);
  const parts = [];
  if (s.p50LatencyMs != null) parts.push(`Usually answers in ${s.p50LatencyMs} ms (last call ${s.lastLatencyMs} ms)`);
  parts.push(`${worked} of the last ${s.calls} calls worked`);
  if (s.retriesUsed) parts.push(`${s.retriesUsed} ${s.retriesUsed === 1 ? 'retry' : 'retries'} needed`);
  if (s.lastError) parts.push(`last problem: ${s.lastError}`);
  return parts.join(' · ');
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
        <div className="setting"><span>Banana API</span><span className="setting-note">{apiStatus.line}</span></div>
        {apiStatus.health && <div className="setting"><span>API health</span><span className="setting-note">{apiStatus.health}</span></div>}
        <div className="setting"><span>Controls</span><button className="toggle" onClick={onControls}>View</button></div>
      </div>
    </Panel>
  );
}
