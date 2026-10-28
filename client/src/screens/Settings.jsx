// Settings, saved in this browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel } from './common.jsx';

const OPTIONS = [['sound', 'Sound effects'], ['laser', 'Sight laser'], ['banners', 'Kill-streak banners']];

export default function Settings({ settings, onToggle, onControls, onLogout, onBack }) {
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
        <div className="setting"><span>Controls</span><button className="toggle" onClick={onControls}>View</button></div>
      </div>
    </Panel>
  );
}
