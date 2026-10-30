// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { POWERS, BANANA_CRATE } from '../game/config.js';
import { registerPowerOpener } from '../services/powerBridge.js';

const RING = 2 * Math.PI * 26;

export default function PowerPicker() {
  const [req, setReq] = useState(null);
  const [left, setLeft] = useState(0);
  const deadline = useRef(0);

  const opened = useRef(0);
  useEffect(() => registerPowerOpener((choices, seconds = BANANA_CRATE.pickSeconds) => new Promise((resolve) => {
    deadline.current = performance.now() + seconds * 1000;
    opened.current = performance.now();
    setLeft(seconds);
    setReq({ choices, seconds, resolve });
  }), () => setReq((r) => { r?.resolve('random'); return null; })), []);

  const choose = useCallback((id) => {
    setReq((r) => { r?.resolve(id); return null; });
  }, []);

  useEffect(() => {
    if (!req) return undefined;
    const tick = setInterval(() => {
      const s = Math.max(0, (deadline.current - performance.now()) / 1000);
      setLeft(s);
      if (s <= 0) choose('random');
    }, 100);
    const onKey = (e) => {
      if (e.repeat || performance.now() - opened.current < 300) return;
      const n = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (n && req.choices[Number(n[2]) - 1]) choose(req.choices[Number(n[2]) - 1]);
      else if (e.code === 'KeyR') choose('random');
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => { clearInterval(tick); document.removeEventListener('keydown', onKey, true); };
  }, [req, choose]);

  if (!req) return null;
  return (
    <div className="puzzle power-picker" role="dialog" aria-modal="true" aria-labelledby="power-title">
      <div className="puzzle-card">
        <header className="puzzle-head">
          <div>
            <span className="mode-chip">Banana crate opened</span>
            <h2 id="power-title">Choose your Banana Power</h2>
            <p id="puzzle-sub">{req.choices.length} powers on offer (a faster solve earns more cards). Tap a card (or press {req.choices.map((_, i) => i + 1).join(', ')}, or R for Random with +{BANANA_CRATE.randomBonus} s). Random is picked when time runs out.</p>
          </div>
          <div className="timer-ring" aria-label="Seconds left">
            <svg viewBox="0 0 60 60">
              <circle className="track" cx="30" cy="30" r="26" />
              <circle className="ring" cx="30" cy="30" r="26" data-low={left < 2 ? 'true' : 'false'} style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - left / req.seconds) }} />
            </svg>
            <span id="puzzle-time">{Math.ceil(left)}</span>
          </div>
        </header>
        <div className="power-cards">
          {req.choices.map((id, i) => {
            const p = POWERS[id];
            return (
              <button key={id} className="power-card" style={{ '--power': p.color }} onClick={() => choose(id)}>
                <kbd>{i + 1}</kbd>
                <span className="power-icon" aria-hidden="true">{p.icon}</span>
                <b>{p.name}</b>
                <span>{p.text}</span>
                <small>{p.seconds} seconds</small>
              </button>
            );
          })}
          <button className="power-card random" onClick={() => choose('random')}>
            <kbd>R</kbd>
            <span className="power-icon" aria-hidden="true">🎲</span>
            <b>Random</b>
            <span>Any of the five powers</span>
            <small>+{BANANA_CRATE.randomBonus} bonus seconds</small>
          </button>
        </div>
      </div>
    </div>
  );
}
