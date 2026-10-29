// The Banana API puzzle window. It opens when you deploy, ask for a Banana respawn
// or open a banana crate. The picture comes from the Banana API through our server
// and answers are checked on the server, so the solution is never in the browser.
// Each puzzle has a countdown; running out of time counts as a miss.
//
// Anything can open it with askPuzzle() (puzzleBridge.js); it resolves to
// 'solved', 'failed' or 'cancelled'. Puzzles come over HTTP (/api/puzzle) by default;
// online matches pass options.source to fetch and answer them over the WebSocket.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { emit } from '../lib/eventBus.js';
import { api } from '../lib/api.js';
import { PUZZLE_RULES } from '../game/config.js';
import { registerPuzzleOpener } from '../lib/puzzleBridge.js';
import { puzzleStats } from '../lib/storage.js';

const RING = 2 * Math.PI * 26;   // circumference of the timer ring (r = 26)
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

// What a right answer does, by puzzle purpose.
const CORRECT = {
  deploy: 'Correct! Deploying…',
  respawn: 'Correct! Back in the fight.',
  crate: 'Correct! Choose your Banana Power.',
  daily: 'Correct!',
};

export default function PuzzleModal() {
  const [req, setReq] = useState(null);          // { purpose, options, resolve }
  const [puzzle, setPuzzle] = useState(null);    // { puzzleId, image, source }
  const [phase, setPhase] = useState('loading'); // loading | ready | error | answering | done
  const [status, setStatus] = useState({ text: '', kind: '' });
  const [left, setLeft] = useState(0);
  const [picked, setPicked] = useState(null);
  const [flash, setFlash] = useState('');
  const [showRetry, setShowRetry] = useState('');
  const deadline = useRef(0);
  const live = useRef(null);                     // the request currently on screen

  const closeRef = useRef(null);   // finish('closed'), for closePuzzle() in puzzleBridge
  useEffect(() => registerPuzzleOpener((purpose, options) => new Promise((resolve) => {
    setReq({ purpose, options, resolve, key: Math.random() });
  }), () => closeRef.current?.()), []);

  // options.seconds (from the chosen difficulty) overrides the default time.
  const rules = req ? {
    ...PUZZLE_RULES[req.purpose], seconds: req.options.seconds ?? PUZZLE_RULES[req.purpose].seconds,
    ...(req.options.retry ? { rule: 'New puzzle after a miss' } : {}),
  } : null;
  const secondsFor = (r) => r.options.seconds ?? PUZZLE_RULES[r.purpose].seconds;

  const finish = useCallback((result) => {
    const r = live.current;
    if (!r) return;
    live.current = null;
    setReq(null);
    setPuzzle(null);
    setFlash('');
    setPicked(null);
    r.resolve(result);
  }, []);
  closeRef.current = () => finish('closed');

  const load = useCallback(async (r) => {
    setPuzzle(null);
    setPicked(null);
    setShowRetry('');
    setPhase('loading');
    setLeft(secondsFor(r));
    setStatus({ text: 'Fetching a puzzle from the Banana API…', kind: '' });
    emit('banana:requested', { purpose: r.purpose });
    try {
      const p = await (r.options.source?.get ?? api.puzzle)(r.purpose);
      await new Promise((ok, fail) => {      // wait until the picture can be shown
        const img = new Image();
        img.onload = ok;
        img.onerror = () => fail(new Error('The puzzle image could not be loaded.'));
        img.src = p.image;
      });
      if (live.current !== r) return;
      setPuzzle(p);
      setPhase('ready');
      setStatus({ text: 'Enter the missing digit hidden by the banana.', kind: '' });
      deadline.current = performance.now() + secondsFor(r) * 1000;
      emit('banana:loaded', { purpose: r.purpose });
    } catch (err) {
      if (live.current !== r) return;
      setPhase('error');
      setStatus({ text: err.message, kind: 'bad' });
      setShowRetry('Try again');
      emit('banana:error', { purpose: r.purpose, message: err.message });
    }
  }, []);

  // A new request: show the window and fetch the first puzzle.
  useEffect(() => {
    if (!req) return;
    live.current = req;
    load(req);
  }, [req, load]);

  const answer = useCallback(async (n, timedOut = false) => {
    const r = live.current;
    if (!r || !puzzle || phase !== 'ready') return;
    setPhase('answering');
    setPicked(n);
    try {
      const result = await (r.options.source?.answer ?? api.answer)(puzzle.puzzleId, n);
      emit('banana:answered', { purpose: r.purpose, correct: result.correct, timedOut });
      setFlash('');
      requestAnimationFrame(() => setFlash(result.correct ? 'good' : 'bad'));
      if (result.correct) {
        setStatus({ text: CORRECT[r.purpose] ?? 'Correct!', kind: 'good' });
        setTimeout(() => finish('solved'), 900);
        return;
      }
      const why = timedOut ? 'Time is up' : 'Not quite';
      if (r.options.retry ?? PUZZLE_RULES[r.purpose].retry) {
        setStatus({ text: `${why}: it was ${result.solution}. Here comes another one.`, kind: 'bad' });
        setTimeout(() => { if (live.current === r) load(r); }, 1500);
      } else {
        setStatus({ text: `${why}: it was ${result.solution}.`, kind: 'bad' });
        setTimeout(() => finish('failed'), 1500);
      }
    } catch (err) {
      setPicked(null);
      setStatus({ text: err.message, kind: 'bad' });
      setShowRetry('New puzzle');
      setPhase('error');
    }
  }, [puzzle, phase, finish, load]);

  // Countdown; running out of time is a wrong answer.
  useEffect(() => {
    if (phase !== 'ready') return undefined;
    const tick = () => {
      const s = Math.max(0, (deadline.current - performance.now()) / 1000);
      setLeft(s);
      if (s <= 0) answer(-1, true);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [phase, answer]);

  // Number keys answer, Esc cancels. Captured first so the game does not see them.
  useEffect(() => {
    if (!req) return undefined;
    const onKey = (e) => {
      if (/^(Digit|Numpad)[0-9]$/.test(e.code)) answer(Number(e.code.slice(-1)));
      else if (e.code === 'Escape') finish('cancelled');
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [req, answer, finish]);

  if (!req) return null;
  const { options = {} } = req;
  const total = rules.seconds;
  const imgState = phase === 'error' && !puzzle ? 'error' : puzzle ? 'ready' : 'loading';
  // Timer colour: banana while more than half is left, orange under half, red and pulsing under a quarter.
  const counting = phase === 'ready' || phase === 'answering';
  const frac = counting && total ? left / total : 1;
  const urgency = frac > 0.5 ? 'safe' : frac >= 0.25 ? 'warn' : 'danger';

  return (
    <div className="puzzle" role="dialog" aria-modal="true" aria-labelledby="puzzle-title" data-purpose={req.purpose}>
      <div className={`puzzle-card ${flash}`}>
        <header className="puzzle-head">
          <div>
            {options.modeLabel && <span className="mode-chip">{options.modeLabel}</span>}
            <span className="rule-chip">{rules.rule} · {total} s</span>
            {puzzle?.source === 'reserve' && <span className="rule-chip offline">Banana API offline · reserve puzzle</span>}
            <h2 id="puzzle-title">{options.title}</h2>
            <p id="puzzle-sub">{options.subtitle}</p>
          </div>
          <div className="timer-ring" role="timer" aria-label="Seconds left" data-level={urgency}>
            <svg viewBox="0 0 60 60" aria-hidden="true">
              <circle className="track" cx="30" cy="30" r="26" />
              <circle className="ring" cx="30" cy="30" r="26"
                style={{ strokeDasharray: RING, strokeDashoffset: counting ? RING * (1 - left / total) : 0 }} />
            </svg>
            <span id="puzzle-time">{Math.ceil(left)}</span>
          </div>
        </header>
        <div className="puzzle-body">
          <div className="puzzle-img-wrap" data-state={imgState}>
            {puzzle && <img id="puzzle-img" src={puzzle.image} alt="Banana API puzzle: equations with one number hidden under a banana" />}
            <span className="img-msg loading-msg">Loading puzzle…</span>
            <span className="img-msg error-msg">No puzzle right now</span>
          </div>
          <div className="puzzle-side">
            <p id="puzzle-status" role="status" data-kind={status.kind}>{status.text}</p>
            <div className="keypad">
              {DIGITS.map((d) => (
                <button key={d} className={`${d === 0 ? 'zero ' : ''}${picked === d ? 'picked' : ''}`} disabled={phase !== 'ready'} onClick={() => answer(d)}>{d}</button>
              ))}
            </div>
            <div className="puzzle-stats">
              <span><svg className="ico" aria-hidden="true"><use href="#i-banana" /></svg><b>{puzzleStats.solved}</b> solved</span>
              <span><b>{puzzleStats.streak}</b> streak</span>
            </div>
            <div className="puzzle-actions">
              {showRetry && <button className="mbtn" onClick={() => load(req)}>{showRetry}</button>}
              <button className="mbtn ghost" onClick={() => finish('cancelled')}>{options.cancelText ?? 'Cancel'}</button>
            </div>
          </div>
        </div>
        <p className="puzzle-credit">Type <kbd>0</kbd>–<kbd>9</kbd> or tap a number · Puzzles by the <a href="https://marcconrad.com/uob/banana/" target="_blank" rel="noopener noreferrer">Banana API</a></p>
      </div>
    </div>
  );
}
