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

import { on } from '../lib/eventBus.js';

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
  // A random slice of the shared 2 s buffer, so repeats differ, but never so late
  // that a long sound (explosion rumble, sniper tail) runs off the end of it.
  src.start(t, Math.random() * Math.max(0, 2 - dur - 0.05));
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

// ---------- Impacts ----------
const mid = (s) => (s ? { x: s.x + (s.w ?? 0) / 2, y: s.y + (s.h ?? 0) / 2 } : {});

function explosion(x, y) {
  const v = voice(x, y, 1, 1.4, { priority: true });
  tone(v, 62, 0.9, { volume: 0.55, type: 'sine', slideTo: 24 });                         // sub-bass
  noise(v, { dur: 1.0, volume: 0.6, type: 'lowpass', freq: 900, freqTo: 150, brown: true });
  noise(v, { dur: 0.25, volume: 0.35, type: 'lowpass', freq: 2500 });                    // initial blast
  for (let i = 0; i < 6; i++) {                                                           // debris crackle
    noise(v, { dur: 0.03, volume: 0.08 + Math.random() * 0.08, type: 'highpass', freq: 2500 + Math.random() * 2500, delay: 0.12 + Math.random() * 0.6 });
  }
}

function fleshHit(victim) {
  if (!allow(`flesh:${victim.id}`, 40)) return;
  const p = mid(victim);
  const v = voice(p.x, p.y, 0.8, 0.15);
  noise(v, { dur: 0.08, volume: 0.35, type: 'lowpass', freq: 450 });
  tone(v, 120, 0.08, { volume: 0.2, type: 'sine', slideTo: 60 });
}

function ricochet(x, y) {
  if (!allow('ricochet', 70)) return;
  const v = voice(x, y, 0.5, 0.2);
  noise(v, { dur: 0.025, volume: 0.3, type: 'highpass', freq: 3500 });
  if (Math.random() < 0.3) tone(v, 2400 + Math.random() * 800, 0.15, { volume: 0.04, type: 'sine', slideTo: 1300 });   // occasional whine
}

// ---------- Player feedback ----------
const hitMarker = () => { if (allow('hitmarker', 50)) tone(ui(0.05), 2400, 0.035, { volume: 0.07, type: 'sine' }); };
function headshotDing() {
  const v = ui(0.5);
  tone(v, 1760, 0.4, { volume: 0.1, type: 'sine' });
  tone(v, 2637, 0.3, { volume: 0.05, type: 'sine', delay: 0.01 });
}
function killChord() {
  const v = ui(0.45);
  [659, 831, 988].forEach((f, i) => tone(v, f, 0.35 - i * 0.05, { volume: 0.08, type: 'triangle', delay: i * 0.04 }));
  tone(v, 1319, 0.2, { volume: 0.05, type: 'sine', delay: 0.12 });
}
function hurt() {
  if (!allow('hurt', 80)) return;
  const v = ui(0.15);
  noise(v, { dur: 0.1, volume: 0.25, type: 'lowpass', freq: 350 });
  tone(v, 140, 0.09, { volume: 0.1, type: 'sawtooth', slideTo: 90 });
}
const click = (v, freq, delay = 0, volume = 0.18) => {
  noise(v, { dur: 0.02, volume, type: 'bandpass', freq, q: 2, delay });
  tone(v, freq / 2, 0.02, { volume: volume / 3, type: 'square', delay });
};

// One sound per pickup kind (shield, fuel and ammo crates may not exist yet; unknown kinds get the default).
const PICKUPS = {
  banana(v) { [523, 659, 784, 1047].forEach((f, i) => tone(v, f, 0.18, { volume: 0.09, type: 'triangle', delay: i * 0.06 })); },
  health(v) { tone(v, 440, 0.3, { volume: 0.1, type: 'sine', slideTo: 660 }); tone(v, 880, 0.25, { volume: 0.06, type: 'sine', delay: 0.1 }); },
  weapon(v) { click(v, 1800); click(v, 1200, 0.09); noise(v, { dur: 0.08, volume: 0.1, type: 'bandpass', freq: 900, delay: 0.04 }); },
  shield(v) { tone(v, 600, 0.45, { volume: 0.08, type: 'sine', slideTo: 1800 }); tone(v, 900, 0.4, { volume: 0.05, type: 'triangle', slideTo: 2400, delay: 0.05 }); },
  fuel(v) { noise(v, { dur: 0.35, volume: 0.2, type: 'bandpass', freq: 250, freqTo: 900, q: 4, brown: true }); [0, 0.08, 0.17].forEach((d) => tone(v, 300 + d * 2000, 0.06, { volume: 0.06, type: 'sine', slideTo: 700, delay: d })); },
  ammo(v) { [0, 0.06, 0.12].forEach((d, i) => click(v, 1500 + i * 300, d, 0.14)); },
  default(v) { tone(v, 660, 0.08, { volume: 0.1, type: 'triangle' }); tone(v, 990, 0.1, { volume: 0.1, type: 'triangle', delay: 0.07 }); },
};

const lastSwing = new Map();   // soldier id → time of their last melee swing (a hit right after it is a melee hit)
let landedEvents = false;      // true once the world sends 'soldier:landed' itself

function landing(soldier, speed) {
  const p = mid(soldier);
  const k = Math.min(1, (speed - 250) / 700);
  if (k <= 0) return;
  const v = voice(p.x, p.y, soldier.isPlayer ? 0.9 : 0.5, 0.3, { priority: soldier.isPlayer });
  noise(v, { dur: 0.15, volume: 0.2 + 0.3 * k, type: 'lowpass', freq: 380, brown: true });
  tone(v, 90, 0.15, { volume: 0.15 + 0.2 * k, type: 'sine', slideTo: 45 });
}

export function initSound() {
  // If the frame loop stops calling updateSound (menu, pause), fade out any loops left playing.
  setInterval(() => { if (ctx && loops.size && performance.now() - lastUpdate > 250) reapLoops(-1); }, 250);
  on('banana:answered', ({ correct }) => (correct ? chime() : buzzer()));
  on('weapon:fired', ({ soldier, weapon, x, y }) => {
    const gun = GUNS[weapon];
    if (!gun) return;
    const mine = !!soldier?.isPlayer;
    if (gun.gap && !allow(`gun:${soldier?.id ?? weapon}`, gun.gap)) return;
    gun.play(voice(x, y, mine ? 1 : 0.8, gun.length, { priority: mine }));
    if (weapon === 'flamer' && soldier) flaming.set(soldier, performance.now());
  });
  on('explosion', ({ x, y }) => explosion(x, y));
  on('bullet:wall', ({ x, y }) => ricochet(x, y));
  on('grenade:bounce', ({ x, y } = {}) => {
    if (!allow('clink', 60)) return;
    const v = x === undefined ? ui(0.15, 0.6) : voice(x, y, 0.7, 0.15);
    tone(v, 1900, 0.08, { volume: 0.08, type: 'triangle' });
    tone(v, 2800, 0.05, { volume: 0.05, type: 'sine', delay: 0.005 });
    noise(v, { dur: 0.02, volume: 0.1, type: 'highpass', freq: 4000 });
  });
  on('melee:swing', ({ soldier }) => {
    if (!soldier) return;
    lastSwing.set(soldier.id, performance.now());
    const p = mid(soldier);
    noise(voice(p.x, p.y, soldier.isPlayer ? 1 : 0.7, 0.2, { priority: soldier.isPlayer }), { dur: 0.16, volume: 0.25, type: 'bandpass', freq: 500, freqTo: 1900, q: 1.5, attack: 0.04 });
  });
  on('grenade:thrown', ({ soldier }) => {
    if (!soldier) return;
    const p = mid(soldier);
    const v = voice(p.x, p.y, soldier.isPlayer ? 1 : 0.6, 0.25, { priority: soldier.isPlayer });
    click(v, 2500, 0, 0.1);                                                                    // pin
    noise(v, { dur: 0.15, volume: 0.12, type: 'bandpass', freq: 700, freqTo: 1400, q: 1.2, delay: 0.05, attack: 0.03 });
  });

  on('weapon:reloading', ({ soldier }) => {
    if (!soldier?.isPlayer) return;
    const v = ui(0.3);
    click(v, 1400);                                                                            // mag release
    noise(v, { dur: 0.12, volume: 0.08, type: 'bandpass', freq: 700, delay: 0.05 });            // mag sliding out
  });
  on('weapon:reloaded', ({ soldier }) => {
    if (!soldier?.isPlayer) return;
    const v = ui(0.3);
    click(v, 900, 0, 0.22);                                                                    // mag in
    click(v, 1700, 0.12, 0.16);                                                                // slide rack
  });
  on('weapon:empty', ({ soldier }) => {
    if (soldier?.isPlayer && allow('empty', 150)) click(ui(0.05), 2200, 0, 0.12);
  });
  on('pickup:taken', ({ soldier, kind }) => {
    if (!soldier?.isPlayer) return;
    (PICKUPS[kind] ?? PICKUPS.default)(ui(0.6));
  });
  // Banana Powers: a rising fanfare when one starts, ticks near the end, a fall when it ends.
  on('power:start', ({ soldier }) => {
    if (!soldier?.isPlayer) return;
    const v = ui(0.7);
    [523, 659, 784, 1046].forEach((f, i) => tone(v, f, 0.14, { volume: 0.12, type: 'triangle', delay: i * 0.07 }));
  });
  on('power:warning', ({ soldier }) => {
    if (soldier?.isPlayer) [0, 0.25].forEach((d) => tone(ui(0.5), 880, 0.07, { volume: 0.09, type: 'square', delay: d }));
  });
  on('power:end', ({ soldier }) => {
    if (soldier?.isPlayer) tone(ui(0.6), 700, 0.35, { volume: 0.1, type: 'sawtooth', slideTo: 180 });
  });
  // Your shield is used up: a falling glassy tone.
  on('shield:broken', ({ soldier }) => {
    if (soldier?.isPlayer) tone(ui(0.5), 1400, 0.25, { volume: 0.12, type: 'triangle', slideTo: 380 });
  });

  on('soldier:damaged', ({ victim, attacker, headshot }) => {
    if (!victim) return;
    if (victim.isPlayer) hurt();
    else fleshHit(victim);
    if (attacker && performance.now() - (lastSwing.get(attacker.id) ?? -1e9) < 250) {
      lastSwing.delete(attacker.id);                                                           // melee connected
      const p = mid(victim);
      const v = voice(p.x, p.y, 1, 0.2, { priority: !!attacker.isPlayer });
      noise(v, { dur: 0.1, volume: 0.4, type: 'lowpass', freq: 700 });
      tone(v, 160, 0.1, { volume: 0.25, type: 'sine', slideTo: 70 });
    }
    if (attacker?.isPlayer && !victim.isPlayer) (headshot ? headshotDing() : hitMarker());
  });
  on('soldier:killed', ({ victim, killer, headshot }) => {
    if (killer?.isPlayer && !victim?.isPlayer) { killChord(); if (headshot) headshotDing(); }
    if (victim?.isPlayer) {
      const v = ui(0.8);
      tone(v, 330, 0.6, { volume: 0.1, type: 'triangle', slideTo: 110 });
      noise(v, { dur: 0.4, volume: 0.15, type: 'lowpass', freq: 300, brown: true });
    }
  });

  on('soldier:landed', ({ soldier, speed }) => {
    landedEvents = true;
    if (soldier && speed) landing(soldier, speed);
  });
  on('jetpack:sputter', ({ soldier } = {}) => {
    if (soldier && !soldier.isPlayer) return;
    if (!allow('sputter', 400)) return;
    const v = ui(0.5, 0.8);
    [0, 0.09, 0.2, 0.34].forEach((d, i) => noise(v, { dur: 0.05, volume: 0.25 - i * 0.04, type: 'bandpass', freq: 500, q: 2, delay: d, brown: true }));
  });
}

// ---------- Continuous sounds (called every frame) ----------
// Jetpack roars, the flamethrower hiss, footsteps, landings and the low-health
// heartbeat depend on what soldiers are doing right now rather than on one event,
// so GameSession and NetGame call updateSound() once per frame with the soldiers.
const flaming = new Map();   // soldier → time of their last flamer shot
const loops = new Map();     // `${kind}:${soldier id}` → { src, gain, pan, filter, seen }
const tracks = new Map();    // soldier id → { x, y, vy, onGround, step } from the last frame
const JET_BOTS = 3;          // only the nearest few bots get a jetpack loop
let lastUpdate = 0;
let nextBeat = 0;

// A looping noise source with its own filter, gain and panner, faded in from silence.
function startLoop(kind) {
  const a = audio();
  const src = a.createBufferSource();
  src.buffer = kind === 'jet' ? brownNoise : whiteNoise;
  src.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = kind === 'jet' ? 'bandpass' : 'highpass';
  filter.frequency.value = kind === 'jet' ? 420 : 1800;
  filter.Q.value = kind === 'jet' ? 0.6 : 0.5;
  const gain = a.createGain();
  gain.gain.value = 0;
  let last = src.connect(filter).connect(gain);
  const pan = a.createStereoPanner ? a.createStereoPanner() : null;
  if (pan) last = last.connect(pan);
  last.connect(effects);
  src.start(a.currentTime, Math.random() * 1.5);
  return { src, gain, pan, filter, seen: 0 };
}

function setLoop(key, kind, x, y, volume, frame) {
  let l = loops.get(key);
  if (!l) { l = startLoop(kind); loops.set(key, l); }
  l.seen = frame;
  const t = ctx.currentTime;
  l.gain.gain.setTargetAtTime(volume * volumeAt(x, y), t, 0.06);
  if (l.pan) l.pan.pan.setTargetAtTime(panAt(x), t, 0.05);
  if (kind === 'jet') l.filter.frequency.setTargetAtTime(380 + Math.random() * 120, t, 0.03);   // a little flutter
}

// Fades out and stops loops nobody asked for this frame.
function reapLoops(frame) {
  for (const [key, l] of loops) {
    if (l.seen === frame) continue;
    l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    l.src.stop(ctx.currentTime + 0.5);
    loops.delete(key);
  }
}

function footstep(s, p) {
  const v = voice(p.x, p.y + 20, s.isPlayer ? 0.6 : 0.3, 0.08, { priority: s.isPlayer });
  noise(v, { dur: 0.04, volume: 0.18, type: 'lowpass', freq: 600 + Math.random() * 300 });
  tone(v, 85 + Math.random() * 20, 0.04, { volume: 0.06, type: 'sine' });
}

function heartbeat() {
  const v = ui(0.5, 0.9);
  tone(v, 62, 0.12, { volume: 0.35, type: 'sine', slideTo: 45 });
  tone(v, 55, 0.12, { volume: 0.25, type: 'sine', slideTo: 40, delay: 0.16 });
}

let frameNo = 0;
export function updateSound(soldiers = [], player = null) {
  if (!ctx) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - (lastUpdate || now)) / 1000);
  lastUpdate = now;
  frameNo += 1;
  if (silent() || !soldiers.length) { reapLoops(frameNo); return; }

  // Jetpacks: the player's own loop is loud and centred, the nearest bots are quieter.
  const jetting = soldiers.filter((s) => s.alive && s.jetting && (s.isPlayer || volumeAt(mid(s).x, mid(s).y) > 0.05));
  jetting.sort((a, b) => (b.isPlayer - a.isPlayer) || volumeAt(mid(b).x, mid(b).y) - volumeAt(mid(a).x, mid(a).y));
  jetting.slice(0, JET_BOTS + 1).forEach((s) => { const p = mid(s); setLoop(`jet:${s.id}`, 'jet', p.x, p.y, s.isPlayer ? 0.3 : 0.12, frameNo); });

  // Flamethrower hiss: lasts while shots keep coming (a gap of 150 ms ends it).
  for (const [s, at] of flaming) {
    if (now - at > 150 || !s.alive) { flaming.delete(s); continue; }
    const p = mid(s);
    setLoop(`flame:${s.id}`, 'flame', p.x, p.y, s.isPlayer ? 0.16 : 0.1, frameNo);
  }
  reapLoops(frameNo);

  // Footsteps and landings come from how each nearby soldier moved since the last frame.
  for (const s of soldiers) {
    const p = mid(s);
    const near = s.isPlayer || volumeAt(p.x, p.y) > 0.6;
    const prev = tracks.get(s.id);
    const vy = prev && dt > 0 ? (p.y - prev.y) / dt : 0;
    if (!s.alive || !near) { tracks.set(s.id, { x: p.x, y: p.y, vy, onGround: s.onGround, step: 0 }); continue; }
    let step = prev?.step ?? 0;
    if (prev && s.onGround && prev.onGround) {
      const speed = Math.abs(p.x - prev.x) / (dt || 1);
      if (speed > 40 && speed < 2000) {
        step += speed * dt;
        if (step > 52) { step = 0; footstep(s, p); }
      }
    } else if (prev && s.onGround && !prev.onGround && !landedEvents) landing(s, prev.vy);
    tracks.set(s.id, { x: p.x, y: p.y, vy, onGround: s.onGround, step });
  }

  // Heartbeat while the player is badly hurt: faster as health drops.
  if (player?.alive && player.health < 30 && player.health > 0) {
    const t = ctx.currentTime;
    if (t >= nextBeat) { heartbeat(); nextBeat = t + 0.55 + (player.health / 30) * 0.45; }
  } else nextBeat = 0;
}
