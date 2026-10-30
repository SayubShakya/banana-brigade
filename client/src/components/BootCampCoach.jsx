// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { useBus } from '../hooks/useBus.js';
import { emit } from '../services/eventBus.js';
import { bootCampStep } from '../game/tutorial.js';
import { Icon } from './common.jsx';
import '../styles/bootcamp.css';

const TIP_MS = 6000;
const HIDDEN_STATES = ['paused', 'idle', 'over'];

const Keys = ({ keys }) => (keys.length === 2 && keys[0] === '0'
  ? <span className="coach-keys"><kbd>0</kbd>–<kbd>9</kbd></span>
  : <span className="coach-keys">{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>);

export default function BootCampCoach() {
  const [step, setStep] = useState(bootCampStep);
  const [tips, setTips] = useState([]);
  const [state, setState] = useState('idle');

  useBus('tutorial:step', setStep);
  useBus('game:state', ({ state: next }) => setState(next));
  useBus('tip:show', ({ id, text }) => {
    const key = `${id ?? 'tip'}-${Date.now()}`;
    setTips((list) => [...list.filter((t) => t.id !== id), { id, key, text }]);
    setTimeout(() => setTips((list) => list.filter((t) => t.key !== key)), TIP_MS);
  });

  if (HIDDEN_STATES.includes(state)) return null;
  const done = step?.id === 'done';

  return (
    <div className="coach-layer">
      {step && (
        <div className={`coach-card${done ? ' done' : ''}${step.retry ? ' retry' : ''}${state === 'puzzle' ? ' compact' : ''}`} role="status" aria-live="polite">
          <div className="coach-head">
            <span className="coach-chip"><Icon id="target" />Boot Camp</span>
            {!done && <span className="coach-count">Step {step.index + 1} of {step.total}</span>}
            {!done && <button className="coach-skip" onClick={() => emit('tutorial:skip')}>Skip</button>}
          </div>
          <b className="coach-title">{step.retry ? 'Not quite. The crate is back in 2 seconds' : step.title}</b>
          <p className="coach-text">{step.retry ? 'Open it again with E and try another puzzle.' : step.text}</p>
          {step.keys && !done && <Keys keys={step.keys} />}
          <div className="coach-progress" aria-hidden="true">
            {Array.from({ length: step.total }, (_, i) => <i key={i} className={i < step.index ? 'on' : i === step.index ? 'now' : ''} />)}
          </div>
        </div>
      )}
      {tips.length > 0 && (
        <div className="coach-tips">
          {tips.map((t) => <div key={t.key} className="coach-tip" role="status"><Icon id="banana" />{t.text}</div>)}
        </div>
      )}
    </div>
  );
}
