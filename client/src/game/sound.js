// Sound effects made with the Web Audio API (no audio files). Each effect is an
// event listener: the world emits "weapon:fired" or "explosion" and this module
// plays the matching sound. Only sounds near the player are played.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../eventBus.js';

let ctx = null;
let muted = false;
let listener = { x: 0, y: 0 };

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function volumeAt(x, y) {
  if (x === undefined) return 1;
  const d = Math.hypot(x - listener.x, y - listener.y);
  return Math.max(0, 1 - d / 1300);
}

function noise(duration, { volume = 0.3, filter = 1800, decay = duration } = {}) {
  if (muted || volume <= 0.01) return;
  const a = audio();
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * duration), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filter;
  const g = a.createGain();
  g.gain.setValueAtTime(volume, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + decay);
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

function tone(freq, duration, { volume = 0.15, type = 'square', slideTo } = {}) {
  if (muted || volume <= 0.01) return;
  const a = audio();
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + duration);
  const g = a.createGain();
  g.gain.setValueAtTime(volume, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + duration);
}

const GUN_SOUNDS = {
  magnum:  { d: 0.16, filter: 2400, v: 0.3 },
  smg:     { d: 0.07, filter: 3200, v: 0.18 },
  rifle:   { d: 0.1,  filter: 2800, v: 0.22 },
  flamer:  { d: 0.08, filter: 600,  v: 0.07 },
  shotgun: { d: 0.3,  filter: 1400, v: 0.4 },
  sniper:  { d: 0.4,  filter: 2200, v: 0.45 },
  rocket:  { d: 0.5,  filter: 700,  v: 0.35 },
};

export function setListener(x, y) { listener = { x, y }; }
export function setMuted(value) { muted = value; }
export const isMuted = () => muted;
export const unlockAudio = () => audio();

export function initSound() {
  on('weapon:fired', ({ weapon, x, y }) => {
    const s = GUN_SOUNDS[weapon];
    if (!s) return;
    noise(s.d, { volume: s.v * volumeAt(x, y), filter: s.filter });
  });
  on('explosion', ({ x, y }) => {
    const v = volumeAt(x, y);
    noise(0.9, { volume: 0.6 * v, filter: 500 });
    tone(90, 0.5, { volume: 0.25 * v, type: 'sine', slideTo: 35 });
  });
  on('weapon:reloading', ({ soldier }) => { if (soldier.isPlayer) tone(320, 0.08, { volume: 0.08 }); });
  on('weapon:reloaded', ({ soldier }) => { if (soldier.isPlayer) tone(520, 0.08, { volume: 0.08 }); });
  on('weapon:empty', ({ soldier }) => { if (soldier.isPlayer) tone(180, 0.05, { volume: 0.08 }); });
  on('pickup:taken', ({ soldier }) => {
    if (!soldier.isPlayer) return;
    tone(660, 0.08, { volume: 0.1, type: 'triangle' });
    setTimeout(() => tone(990, 0.1, { volume: 0.1, type: 'triangle' }), 70);
  });
  on('soldier:damaged', ({ victim, attacker }) => {
    if (victim.isPlayer) tone(140, 0.08, { volume: 0.12, type: 'sawtooth' });
    else if (attacker?.isPlayer) tone(1200, 0.04, { volume: 0.06, type: 'square' }); // hit marker
  });
  on('soldier:killed', ({ killer }) => {
    if (killer?.isPlayer) { tone(880, 0.1, { volume: 0.12, type: 'triangle' }); setTimeout(() => tone(1320, 0.14, { volume: 0.12, type: 'triangle' }), 90); }
  });
  on('grenade:thrown', ({ soldier }) => { if (soldier.isPlayer) tone(400, 0.1, { volume: 0.06, type: 'sine', slideTo: 250 }); });
  on('melee:swing', ({ soldier }) => noise(0.08, { volume: 0.15 * volumeAt(soldier.x, soldier.y), filter: 900 }));
}
