// "Choose your Banana Power": shown after a banana crate puzzle is solved. Three
// random powers, or Random for a few bonus seconds. Keys 1–3 pick a card, R picks
// Random; when the countdown runs out, Random is chosen.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { POWERS, BANANA_CRATE } from '../game/config.js';
import { registerPowerOpener } from '../powerBridge.js';

const RING = 2 * Math.PI * 26;

export default function PowerPicker() {
  const [req, setReq] = useState(null);      // { choices, seconds, resolve }
  const [left, setLeft] = useState(0);
  const deadline = useRef(0);

  useEffect(() => registerPowerOpener((choices, seconds = BANANA_CRATE.pickSeconds) => new Promise((resolve) => {
    deadline.current = performance.now() + seconds * 1000;
    setLeft(seconds);
    setReq({ choices, seconds, resolve });
  })), []);

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
      const n = /^(Digit|Numpad)([1-3])$/.exec(e.code);
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
            <p id="puzzle-sub">Press 1, 2 or 3, or R for a random power with +{BANANA_CRATE.randomBonus} s.</p>
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
