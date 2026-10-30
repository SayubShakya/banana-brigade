// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { emit, on } from '../services/eventBus.js';
import { api } from '../services/api.js';
import { PUZZLE_RULES, PUZZLE_GRADES } from '../game/config.js';
import { registerPuzzleOpener } from '../services/puzzleBridge.js';
import { puzzleStats } from '../services/storage.js';
import '../styles/banana-meter.css';

const RING = 2 * Math.PI * 26;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

const clientGrade = (ms) => Object.entries(PUZZLE_GRADES).find(([, g]) => ms < g.under * 1000)?.[0] ?? 'bronze';

const CORRECT = {
  deploy: 'Correct! Deploying…',
  respawn: 'Correct! Back in the fight.',
  crate: 'Correct! Choose your Banana Power.',
  daily: 'Correct!',
};

export default function PuzzleModal() {
  const [req, setReq] = useState(null);
  const [puzzle, setPuzzle] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [status, setStatus] = useState({ text: '', kind: '' });
  const [left, setLeft] = useState(0);
  const [picked, setPicked] = useState(null);
  const [flash, setFlash] = useState('');
  const [showRetry, setShowRetry] = useState('');
  const [reward, setReward] = useState(null);
  const deadline = useRef(0);
  const shownAt = useRef(0);

  useEffect(() => on('banana:meter', ({ soldier, gained }) => {
    if (soldier?.isPlayer && gained > 0) setReward((r) => (r && r.gain === null ? { ...r, gain: gained } : r));
  }), []);
  const live = useRef(null);

  const closeRef = useRef(null);
  useEffect(() => registerPuzzleOpener((purpose, options) => new Promise((resolve) => {
    setReq({ purpose, options, resolve, key: Math.random() });
  }), () => closeRef.current?.()), []);

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
    setReward(null);
    r.resolve(result);
  }, []);
  closeRef.current = () => finish('closed');

  const load = useCallback(async (r) => {
    setPuzzle(null);
    setPicked(null);
    setShowRetry('');
    setReward(null);
    setPhase('loading');
    setLeft(secondsFor(r));
    setStatus({ text: 'Fetching a puzzle from the Banana API…', kind: '' });
    emit('banana:requested', { purpose: r.purpose });
    try {
      const p = await (r.options.source?.get ?? api.puzzle)(r.purpose);
      await new Promise((ok, fail) => {
        const img = new Image();
        img.onload = ok;
        img.onerror = () => fail(new Error('The puzzle image could not be loaded.'));
        img.src = p.image;
      });
      if (live.current !== r) return;
      setPuzzle(p);
      setPhase('ready');
      setStatus({ text: 'Find the hidden digit in the sum: type 0–9 or click a number.', kind: '' });
      deadline.current = performance.now() + secondsFor(r) * 1000;
      shownAt.current = performance.now();
      emit('banana:loaded', { purpose: r.purpose });
    } catch (err) {
      if (live.current !== r) return;
      setPhase('error');
      setStatus({ text: err.message, kind: 'bad' });
      setShowRetry('Try again');
      emit('banana:error', { purpose: r.purpose, message: err.message });
    }
  }, []);

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
      const clientMs = Math.round(performance.now() - shownAt.current);
      const result = await (r.options.source?.answer ?? api.answer)(puzzle.puzzleId, n);
      const ms = Number.isFinite(result.ms) ? result.ms : clientMs;
      const grade = result.correct ? (result.grade ?? clientGrade(ms)) : null;
      setFlash('');
      if (result.correct) setReward({ grade, secs: (ms / 1000).toFixed(1), streak: puzzleStats.streak + 1, gain: null });
      emit('banana:answered', { purpose: r.purpose, correct: result.correct, timedOut, grade, ms, source: puzzle.source });
      requestAnimationFrame(() => setFlash(result.correct ? 'good' : 'bad soft-shake'));
      if (result.correct) {
        const label = PUZZLE_GRADES[grade]?.label ?? '';
        setStatus({ text: `${CORRECT[r.purpose] ?? 'Correct!'} ${label} · ${(ms / 1000).toFixed(1)} s.`, kind: 'good' });
        setTimeout(() => finish('solved'), 1300);
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
            <span className="rule-chip how">Type 0–9 or click</span>
            {puzzle?.source === 'reserve' && <span className="rule-chip offline">Banana API offline · reserve puzzle</span>}
            <h2 id="puzzle-title">{options.title}</h2>
            <p id="puzzle-sub">{options.subtitle}</p>
            <p className="puzzle-instruction">The picture is a sum with one digit hidden. Find the hidden digit.</p>
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
            {puzzle && <img id="puzzle-img" src={puzzle.image} alt="Banana API puzzle: a sum with one digit hidden" />}
            {reward && <div className="puzzle-burst" aria-hidden="true"><span className="streak-pop">+1 streak · {reward.streak}{reward.gain ? ` · +${reward.gain} meter` : ''}</span></div>}
            <span className="img-msg loading-msg">Loading puzzle…</span>
            <span className="img-msg error-msg">No puzzle right now</span>
          </div>
          <div className="puzzle-side">
            <p id="puzzle-status" role="status" aria-live="polite" data-kind={status.kind}>{status.text}</p>
            {reward && <span className="grade-badge" data-grade={reward.grade}>{PUZZLE_GRADES[reward.grade]?.label} · {reward.secs} s</span>}
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
        <p className="puzzle-credit">Find the hidden digit in the sum · Type <kbd>0</kbd>–<kbd>9</kbd> or click a number · Under 5 s is GOLD, under 10 s SILVER · Puzzles by the <a href="https://marcconrad.com/uob/banana/" target="_blank" rel="noopener noreferrer">Banana API</a></p>
      </div>
    </div>
  );
}
