// Keyboard and touch controls.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel } from './common.jsx';

const KEYS = [
  [['A', 'D'], 'Move'], [['W', 'Space'], 'Jetpack'], [['Mouse'], 'Aim'], [['Click'], 'Shoot'],
  [['Q'], 'Switch weapon'], [['R'], 'Reload'], [['G'], 'Grenade'], [['F'], 'Melee'], [['Z'], 'Zoom'],
  [['E'], 'Open banana crate', true], [['B'], 'Banana respawn', true], [['0', '9'], 'Answer a puzzle', true],
  [['Tab'], 'Scoreboard'], [['Esc'], 'Pause'],
];

export default function Controls({ onBack }) {
  return (
    <Panel wide title="Controls" subtitle="Keyboard and mouse, or the dual sticks on a touch screen."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="controls-layout">
        <div className="key-grid">
          {KEYS.map(([keys, label, banana]) => (
            <div key={label} className={`key-card${banana ? ' banana' : ''}`}>
              <span>{keys.length === 2 && keys[0] === '0' ? <><kbd>0</kbd>–<kbd>9</kbd></> : keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>{label}
            </div>
          ))}
        </div>
        <div className="touch-diagram" aria-label="Touch layout: left stick moves and flies, right stick aims and fires">
          <div className="phone">
            <div className="stick-demo left"><i /></div>
            <div className="stick-demo right"><i /></div>
            <span className="lbl l">Move · push up to fly</span>
            <span className="lbl r">Aim · push to the edge to fire</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
