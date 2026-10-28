// Settings, saved in this browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel } from './common.jsx';

const OPTIONS = [['sound', 'Sound effects'], ['laser', 'Sight laser'], ['banners', 'Kill-streak banners'], ['fps', 'Show FPS (smoothness check)']];

const LEVELS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];

export default function Settings({ settings, onToggle, onSet, onControls, onLogout, onBack }) {
  return (
    <Panel title="Settings" subtitle="Saved in this browser." footer={<>
      <button className="mbtn ghost" onClick={onLogout}>Log out</button>
      <button className="mbtn primary" onClick={onBack}>Back</button>
    </>}>
      <div className="settings-list">
        <div className="setting"><span>Bot difficulty</span>
          <div className="segmented" role="radiogroup" aria-label="Bot difficulty">
            {LEVELS.map(([key, label]) => <button key={key} role="radio" aria-checked={settings.difficulty === key} onClick={() => onSet('difficulty', key)}>{label}</button>)}
          </div>
        </div>
        {OPTIONS.map(([key, label]) => (
          <div className="setting" key={key}>
            <span>{label}</span>
            <button className="toggle" aria-pressed={settings[key]} onClick={() => onToggle(key)}>{settings[key] ? 'On' : 'Off'}</button>
          </div>
        ))}
        <div className="setting"><span>Controls</span><button className="toggle" onClick={onControls}>View</button></div>
      </div>
    </Panel>
  );
}
