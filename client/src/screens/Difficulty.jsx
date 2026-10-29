// Choose a difficulty before every battle. It changes how the bots fight and how
// long each Banana puzzle gives you. The last choice is remembered.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { DIFFICULTY, MODES } from '../game/config.js';
import { Panel, Icon } from '../components/common.jsx';

const ABOUT = {
  easy: ['Bots aim badly and react slowly', 'Bots hit you softly', 'Long puzzle timers'],
  medium: ['Fair bots that fire in bursts', 'Normal damage', 'Normal puzzle timers'],
  hard: ['Sharp, fast bots that keep shooting', 'Full damage', 'Short puzzle timers', 'Win to unlock Hard as Nails'],
};

export default function Difficulty({ mode, current, onPick, onBack }) {
  return (
    <Panel wide title="Choose Difficulty" chip={<span className="mode-chip">{MODES[mode].name}</span>}
      subtitle="Then solve a Banana puzzle to deploy."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="levels">
        {Object.entries(DIFFICULTY).map(([key, d]) => (
          <button key={key} className={`level-card ${key}${key === current ? ' last' : ''}`} onClick={() => onPick(key)}>
            <span className="level-stars" aria-hidden="true">{'★'.repeat(key === 'easy' ? 1 : key === 'medium' ? 2 : 3)}</span>
            <b>{d.name}</b>
            <ul>{ABOUT[key].map((t) => <li key={t}>{t}</li>)}</ul>
            <span className="level-time"><Icon id="banana" />Puzzles: {d.puzzle.deploy}s deploy · {d.puzzle.respawn}s respawn · {d.puzzle.crate}s crate</span>
            {key === current && <span className="level-last">Last played</span>}
          </button>
        ))}
      </div>
    </Panel>
  );
}
