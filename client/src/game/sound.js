// Sound effects made with the Web Audio API (no audio files). Each effect is an
// event listener: the world emits "weapon:fired" or "explosion" and this module
// plays the matching sound. Every sound is built from two ingredients, a burst of
// filtered noise and a filtered tone, layered and shaped with volume envelopes.
// Sounds are placed in the world: they are panned left/right by where they happen
// compared with the player, get quieter with distance, and lose their high end
// when far away (a lowpass filter), like real distant gunfire.
// All effects go through one gain node (the "effects bus"), so the Effects volume
// slider in Settings changes them all at once; music.js has its own bus.
// To stay light, noise is read from two buffers made once, and a small voice
// budget plus per-sound rate limits stop a busy fight from creating hundreds of
// audio nodes at the same time.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../eventBus.js';

let ctx = null;
let effects = null;     // gain node every effect plays through
let muted = false;
let effectsVolume = 0.8;
let listener = { x: 0, y: 0 };
let whiteNoise = null;  // shared noise buffers, made once when audio starts
let brownNoise = null;  // darker noise for rumbles and the jetpack

const HEARING = 1300;   // pixels: further away than this is silent
const MAX_VOICES = 28;  // world sounds playing at once; the player's own sounds may go over
const voiceEnds = [];   // end times (audio clock) of the sounds still playing

function makeNoise(a, seconds, brown) {
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * seconds), a.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
  }
  return buffer;
}

function audio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    effects = ctx.createGain();
    effects.gain.value = effectsVolume;
    // A gentle compressor keeps explosions and shotgun blasts from clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 6;
    effects.connect(limiter).connect(ctx.destination);
    whiteNoise = makeNoise(ctx, 2, false);
    brownNoise = makeNoise(ctx, 2, true);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const silent = () => muted || effectsVolume <= 0;

function volumeAt(x, y) {
  if (x === undefined) return 1;
  const d = Math.hypot(x - listener.x, y - listener.y);
  return Math.max(0, 1 - d / HEARING);
}

// Left/right position from -0.8 to 0.8, from the sound's x compared with the player.
function panAt(x) {
  if (x === undefined) return 0;
  return Math.max(-0.8, Math.min(0.8, (x - listener.x) / 700));
}

// Simple per-sound rate limits: a sound may not start again within `gapMs`.
const lastPlayed = new Map();
function allow(key, gapMs) {
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? -1e9) < gapMs) return false;
  lastPlayed.set(key, now);
  return true;
}

// Opens a "voice": a gain → (distance lowpass) → panner chain into the effects bus,
// placed at (x, y). Returns null when the sound would be silent or the voice budget
// is used up, so callers just skip it. `length` is how long the sound lasts (seconds).
function voice(x, y, volume, length, { priority = false } = {}) {
  if (silent()) return null;
  const v = volume * volumeAt(x, y);
  if (v <= 0.01) return null;
  const a = audio();
  const now = a.currentTime;
  while (voiceEnds.length && voiceEnds[0] <= now) voiceEnds.shift();
  if (!priority && voiceEnds.length >= MAX_VOICES) return null;
  const end = now + length;
  const at = voiceEnds.findIndex((e) => e > end);
  voiceEnds.splice(at < 0 ? voiceEnds.length : at, 0, end);   // kept sorted by end time

  const g = a.createGain();
  g.gain.value = v;
  let last = g;
  const d = x === undefined ? 0 : Math.hypot(x - listener.x, y - listener.y);
  if (d > 300) {
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200 * Math.pow(15, 1 - Math.min(1, d / HEARING));   // 18 kHz near, 1.2 kHz far
    last = last.connect(lp);
  }
  if (a.createStereoPanner && x !== undefined) {
    const p = a.createStereoPanner();
    p.pan.value = panAt(x);
    last = last.connect(p);
  }
  last.connect(effects);
  return { out: g, t: now + 0.005 };
}

// A burst of filtered noise into `out`, starting `delay` seconds after `t`.
function noise(v, { dur = 0.1, volume = 0.3, type = 'lowpass', freq = 1800, freqTo, q = 0.7, delay = 0, attack = 0.002, brown = false } = {}) {
  if (!v) return;
  const t = v.t + delay;
  const src = ctx.createBufferSource();
  src.buffer = brown ? brownNoise : whiteNoise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(v.out);
  src.start(t, Math.random() * 1.5);   // a random slice of the shared buffer, so repeats differ
  src.stop(t + dur + 0.02);
}

// A tone (optionally sliding in pitch) into `out`, starting `delay` seconds after `t`.
function tone(v, freq, dur, { volume = 0.15, type = 'square', slideTo, delay = 0, attack = 0.003 } = {}) {
  if (!v) return;
  const t = v.t + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(v.out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// UI sounds that are not placed in the world (puzzle chimes, hit markers).
const ui = (length, volume = 1) => voice(undefined, undefined, volume, length, { priority: true });

// ---------- Weapons ----------
// Each gun is a recipe of layers: a crack (high noise), a body (mid noise) and a
// thump (falling low tone). `v` is the voice the layers play into.
const GUNS = {
  magnum: { length: 0.3, play(v) {
    noise(v, { dur: 0.05, volume: 0.5, type: 'highpass', freq: 2200 });
    noise(v, { dur: 0.2, volume: 0.45, type: 'bandpass', freq: 900, q: 0.9 });
    tone(v, 170, 0.14, { volume: 0.25, type: 'sine', slideTo: 55 });
  } },
  smg: { length: 0.1, gap: 45, play(v) {
    noise(v, { dur: 0.045, volume: 0.35, type: 'bandpass', freq: 2600, q: 1.2 });
    tone(v, 240, 0.05, { volume: 0.12, type: 'square', slideTo: 90 });
  } },
  rifle: { length: 0.18, gap: 60, play(v) {
    noise(v, { dur: 0.03, volume: 0.4, type: 'highpass', freq: 3000 });
    noise(v, { dur: 0.11, volume: 0.4, type: 'lowpass', freq: 2800 });
    tone(v, 130, 0.12, { volume: 0.28, type: 'sine', slideTo: 48 });
  } },
  shotgun: { length: 0.5, play(v) {
    noise(v, { dur: 0.35, volume: 0.6, type: 'lowpass', freq: 1600, freqTo: 400 });
    noise(v, { dur: 0.18, volume: 0.35, type: 'bandpass', freq: 650, q: 1 });
    tone(v, 85, 0.3, { volume: 0.5, type: 'sine', slideTo: 32 });
  } },
  sniper: { length: 1.2, play(v) {
    noise(v, { dur: 0.03, volume: 0.7, type: 'highpass', freq: 3500 });                     // whip crack
    noise(v, { dur: 0.25, volume: 0.5, type: 'lowpass', freq: 2200, freqTo: 600 });
    tone(v, 110, 0.25, { volume: 0.4, type: 'sine', slideTo: 38 });
    noise(v, { dur: 0.9, volume: 0.12, type: 'lowpass', freq: 600, delay: 0.1, attack: 0.05, brown: true });  // rolling tail
    noise(v, { dur: 0.5, volume: 0.06, type: 'bandpass', freq: 900, delay: 0.25, attack: 0.03 });              // echo
  } },
  rocket: { length: 0.8, play(v) {
    noise(v, { dur: 0.7, volume: 0.4, type: 'bandpass', freq: 350, freqTo: 2200, q: 1.5, attack: 0.06 });  // whoosh
    noise(v, { dur: 0.15, volume: 0.35, type: 'lowpass', freq: 900 });
    tone(v, 70, 0.25, { volume: 0.35, type: 'sine', slideTo: 40 });
  } },
  flamer: { length: 0.12, gap: 90, play(v) {   // the hiss loop (updateSound) carries the rest
    noise(v, { dur: 0.1, volume: 0.12, type: 'lowpass', freq: 700, brown: true });
  } },
};

// ---------- Settings ----------
export function setListener(x, y) { listener = { x, y }; }
export function setMuted(value) { muted = value; }
export const isMuted = () => muted;
// 0..1, from the Effects volume slider.
export function setEffectsVolume(value) {
  effectsVolume = Math.min(1, Math.max(0, value));
  if (effects) effects.gain.setTargetAtTime(effectsVolume, ctx.currentTime, 0.05);
}
// Browsers only allow sound after a click or key press, so this is called from one.
export const unlockAudio = () => audio();
// The shared AudioContext, or null if no gesture has unlocked sound yet (music.js uses it).
export const audioContext = () => ctx;

// Banana puzzle feedback: a rising chime when right, a low buzz when wrong or out of time.
function chime() {
  const v = ui(0.7);
  [784, 988, 1319].forEach((f, i) => tone(v, f, 0.35, { volume: 0.12, type: 'sine', delay: i * 0.09 }));
}
function buzzer() {
  const v = ui(0.35);
  tone(v, 150, 0.32, { volume: 0.14, type: 'sawtooth' });
  tone(v, 156, 0.32, { volume: 0.08, type: 'square' });
}

export function initSound() {
  on('banana:answered', ({ correct }) => (correct ? chime() : buzzer()));
  on('weapon:fired', ({ soldier, weapon, x, y }) => {
    const gun = GUNS[weapon];
    if (!gun) return;
    const mine = !!soldier?.isPlayer;
    if (gun.gap && !allow(`gun:${soldier?.id ?? weapon}`, gun.gap)) return;
    gun.play(voice(x, y, mine ? 1 : 0.8, gun.length, { priority: mine }));
  });
  on('explosion', ({ x, y }) => {
    const v = voice(x, y, 1, 1);
    noise(v, { dur: 0.9, volume: 0.6, freq: 500 });
    tone(v, 90, 0.5, { volume: 0.25, type: 'sine', slideTo: 35 });
  });
  on('weapon:reloading', ({ soldier }) => { if (soldier?.isPlayer) tone(ui(0.1), 320, 0.08, { volume: 0.08 }); });
  on('weapon:reloaded', ({ soldier }) => { if (soldier?.isPlayer) tone(ui(0.1), 520, 0.08, { volume: 0.08 }); });
  on('weapon:empty', ({ soldier }) => { if (soldier?.isPlayer) tone(ui(0.1), 180, 0.05, { volume: 0.08 }); });
  on('pickup:taken', ({ soldier }) => {
    if (!soldier?.isPlayer) return;
    const v = ui(0.2);
    tone(v, 660, 0.08, { volume: 0.1, type: 'triangle' });
    tone(v, 990, 0.1, { volume: 0.1, type: 'triangle', delay: 0.07 });
  });
  on('soldier:damaged', ({ victim, attacker }) => {
    if (victim?.isPlayer) tone(ui(0.1), 140, 0.08, { volume: 0.12, type: 'sawtooth' });
    else if (attacker?.isPlayer) tone(ui(0.05), 1200, 0.04, { volume: 0.06, type: 'square' }); // hit marker
  });
  on('soldier:killed', ({ killer }) => {
    if (!killer?.isPlayer) return;
    const v = ui(0.3);
    tone(v, 880, 0.1, { volume: 0.12, type: 'triangle' });
    tone(v, 1320, 0.14, { volume: 0.12, type: 'triangle', delay: 0.09 });
  });
  on('grenade:thrown', ({ soldier }) => { if (soldier?.isPlayer) tone(ui(0.1), 400, 0.1, { volume: 0.06, type: 'sine', slideTo: 250 }); });
  on('melee:swing', ({ soldier }) => noise(voice(soldier?.x, soldier?.y, 1, 0.1), { dur: 0.08, volume: 0.15, freq: 900 }));
}
