// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../services/eventBus.js';
import { audioContext, unlockAudio } from './sound.js';

const LOOKAHEAD = 0.12;
const TICK_MS = 25;
const FADE = 1.2;

const TRACKS = {
  menu: {
    bpm: 70, stepsPerBeat: 2, stepsPerBar: 8, cutoff: 1100,
    bass: { type: 'triangle', volume: 0.15 }, lead: { type: 'sine', volume: 0.05 },
    chords: [[45, [69, 72, 76]], [41, [65, 69, 72]], [48, [67, 72, 76]], [43, [67, 71, 74]]],
    bassAt: (s) => (s === 0 || s === 4 ? 0 : null),
    bassLength: 4,
    leadAt: (s) => [0, 1, 2, 1, 2, 1, 0, null][s],
  },
  battle: {
    bpm: 96, stepsPerBeat: 2, stepsPerBar: 8, cutoff: 1300,
    bass: { type: 'triangle', volume: 0.16 }, lead: { type: 'sine', volume: 0.05 },
    chords: [[40, [64, 67, 71]], [36, [64, 67, 72]], [38, [62, 66, 69]], [35, [63, 66, 71]]],
    bassAt: (s) => (s % 2 ? null : s % 4 === 2 ? 12 : 0),
    bassLength: 1.8,
    leadAt: (s) => [0, null, 2, null, 1, null, 3, null][s],
  },
};

let master = null;
let volume = 0.4;
let muted = false;
let wanted = 'menu';
const players = [];
let timer = null;

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const hidden = () => typeof document !== 'undefined' && document.hidden;
const level = () => (muted || hidden() ? 0 : volume);

function note(ctx, out, midi, time, length, { type, volume: v }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(v, time + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, time + length);
  o.connect(g).connect(out);
  o.start(time);
  o.stop(time + length + 0.02);
}

function schedule(ctx, p) {
  const t = TRACKS[p.name];
  const stepLen = 60 / t.bpm / t.stepsPerBeat;
  if (p.next < ctx.currentTime - 0.05) p.next = ctx.currentTime + 0.02;
  while (p.next < ctx.currentTime + LOOKAHEAD) {
    const inBar = p.step % t.stepsPerBar;
    const [root, arp] = t.chords[Math.floor(p.step / t.stepsPerBar) % t.chords.length];
    if (level() > 0) {
      const b = t.bassAt(inBar);
      if (b !== null) note(ctx, p.filter, root + b, p.next, stepLen * t.bassLength, t.bass);
      const l = t.leadAt(inBar);
      if (l !== null && l !== undefined) note(ctx, p.filter, l === 3 ? arp[0] + 12 : arp[l], p.next, stepLen * 0.9, t.lead);
    }
    p.next += stepLen;
    p.step += 1;
  }
}

function loop() {
  const ctx = audioContext();
  if (!ctx) return;
  for (const p of [...players]) {
    if (p.stopAt && ctx.currentTime >= p.stopAt) {
      p.gain.disconnect();
      players.splice(players.indexOf(p), 1);
    } else schedule(ctx, p);
  }
  if (!players.length) { clearInterval(timer); timer = null; }
}

function sync() {
  const ctx = audioContext();
  if (!ctx) return;
  if (!master) {
    master = ctx.createGain();
    master.gain.value = level();
    master.connect(ctx.destination);
  }
  const current = players.find((p) => !p.stopAt);
  if (current?.name === wanted) return;
  const now = ctx.currentTime;
  if (current) {
    current.gain.gain.cancelScheduledValues(now);
    current.gain.gain.setValueAtTime(current.gain.gain.value, now);
    current.gain.gain.linearRampToValueAtTime(0, now + FADE);
    current.stopAt = now + FADE + 0.1;
  }
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE);
  gain.connect(master);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = TRACKS[wanted].cutoff;
  filter.connect(gain);
  players.push({ name: wanted, gain, filter, step: 0, next: now + 0.05, stopAt: 0 });
  timer ??= setInterval(loop, TICK_MS);
  loop();
}

function applyLevel() {
  const ctx = audioContext();
  if (master && ctx) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.1);
}

export function setMusicVolume(value) { volume = Math.min(1, Math.max(0, value)); applyLevel(); }
export function setMusicMuted(value) { muted = !!value; applyLevel(); }
export const currentTrack = () => players.find((p) => !p.stopAt)?.name ?? null;

export function initMusic() {
  document.addEventListener('visibilitychange', applyLevel);
  on('game:state', ({ state }) => {
    wanted = ['playing', 'puzzle', 'paused'].includes(state) ? 'battle' : 'menu';
    sync();
  });
  const start = () => {
    unlockAudio();
    sync();
    document.removeEventListener('pointerdown', start, true);
    document.removeEventListener('keydown', start, true);
  };
  document.addEventListener('pointerdown', start, true);
  document.addEventListener('keydown', start, true);
}
