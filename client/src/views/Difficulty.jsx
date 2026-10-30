// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { DIFFICULTY, MODES, MATCH_LENGTHS, DEFAULT_MATCH_LENGTH, matchRules } from '../game/config.js';
import { Panel, Icon } from '../components/common.jsx';
import { emit } from '../services/eventBus.js';
import { readJson } from '../services/storage.js';
import '../styles/bootcamp.css';
import '../styles/match.css';

const LENGTH_MODES = ['quick', 'team'];
export const savedLength = () => readJson('settings', {}).matchLength ?? DEFAULT_MATCH_LENGTH;

export function LengthPicker({ mode, value, onChange }) {
  const index = Math.max(0, MATCH_LENGTHS.findIndex((l) => l.seconds === value));
  const move = (e) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + MATCH_LENGTHS.length) % MATCH_LENGTHS.length;
    onChange(MATCH_LENGTHS[next].seconds);
    e.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next]?.focus();
  };
  return (
    <div className="length-row">
      <span className="length-head" id={`length-${mode}`}><Icon id="target" />Match length</span>
      <div className="length-pills" role="radiogroup" aria-labelledby={`length-${mode}`} style={{ '--n': MATCH_LENGTHS.length, '--i': index }}>
        <span className="length-glider" aria-hidden="true" />
        {MATCH_LENGTHS.map((l, i) => (
          <button key={l.seconds} type="button" role="radio" className="length-pill" aria-checked={i === index} tabIndex={i === index ? 0 : -1}
            aria-label={`${l.label} · first to ${l.kills[mode]}`} onClick={() => onChange(l.seconds)} onKeyDown={move}>
            {l.label}<small>first to {l.kills[mode]}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

const ABOUT = {
  easy: ['Bots hold fire for the first 30 s', 'Bots aim badly and hit you softly', 'Light aim assist on your shots', 'Long puzzle timers'],
  medium: ['Fair bots that fire in bursts', 'Normal damage', 'Normal puzzle timers'],
  hard: ['Sharp, fast bots that keep shooting', 'Full damage', 'Short puzzle timers', 'Win to unlock Hard as Nails'],
};

export default function Difficulty({ mode, current, onPick, onBack, length: chosen, onLength }) {
  const [stored, setStored] = useState(savedLength);
  const length = chosen ?? stored;
  const timed = LENGTH_MODES.includes(mode) && matchRules(mode, length);
  const pickLength = (seconds) => {
    setStored(seconds);
    if (onLength) onLength(seconds);
    else emit('settings:set', { key: 'matchLength', value: seconds });
  };
  return (
    <Panel wide title="Choose Difficulty" chip={<span className="mode-chip">{MODES[mode].name}</span>}
      subtitle={mode === 'training' ? 'Training starts straight away, no puzzle.' : timed ? `${timed.label} match, first to ${timed.killLimit} kills. Then solve a Banana puzzle to deploy.` : 'Then solve a Banana puzzle to deploy.'}
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      {LENGTH_MODES.includes(mode) && <LengthPicker mode={mode} value={length} onChange={pickLength} />}
      <div className="levels">
        {Object.entries(DIFFICULTY).map(([key, d]) => (
          <button key={key} className={`level-card ${key}${key === current ? ' last' : ''}`} onClick={() => onPick(key, LENGTH_MODES.includes(mode) ? length : undefined)}>
            <span className="level-stars" aria-hidden="true">{'★'.repeat(key === 'easy' ? 1 : key === 'medium' ? 2 : 3)}</span>
            <b>{d.name}</b>
            {key === 'easy' && <span className="recommended">Best for new players</span>}
            <ul>{ABOUT[key].map((t) => <li key={t}>{t}</li>)}</ul>
            <span className="level-time"><Icon id="banana" />Puzzles: {d.puzzle.deploy}s deploy · {d.puzzle.respawn}s respawn · {d.puzzle.crate}s crate</span>
            {key === current && <span className="level-last">Last played</span>}
          </button>
        ))}
      </div>
    </Panel>
  );
}
