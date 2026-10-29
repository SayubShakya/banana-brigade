// Background music made with the Web Audio API (no audio files): a calm menu loop
// and a faster battle loop, each a bass line plus an arpeggio over four chords.
// Notes are scheduled a little ahead of time on the audio clock ("lookahead"), so
// the rhythm stays steady even when the page is busy. Like the sound effects, the
// music reacts to events: 'game:state' switches between the two loops with a crossfade.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../lib/eventBus.js';
import { audioContext, unlockAudio } from './sound.js';

const LOOKAHEAD = 0.12;   // seconds of notes scheduled in advance
const TICK_MS = 25;       // how often the scheduler wakes up
const FADE = 1.2;         // crossfade length in seconds

// Chords as [bass note, [arpeggio notes]] in MIDI numbers (60 = middle C).
const TRACKS = {
  menu: {
    bpm: 84, stepsPerBeat: 2, stepsPerBar: 8, cutoff: 1400,
    bass: { type: 'triangle', volume: 0.2 }, lead: { type: 'sine', volume: 0.07 },
    chords: [[45, [69, 72, 76]], [41, [65, 69, 72]], [48, [67, 72, 76]], [43, [67, 71, 74]]],   // Am F C G
    bassAt: (s) => (s === 0 || s === 4 ? 0 : null),                                           // two long notes a bar
    bassLength: 4,
    leadAt: (s) => [0, 1, 2, 1, 2, 1, 0, null][s],
  },
  battle: {
    bpm: 138, stepsPerBeat: 4, stepsPerBar: 16, cutoff: 2200,
    bass: { type: 'sawtooth', volume: 0.13 }, lead: { type: 'square', volume: 0.045 },
    chords: [[40, [64, 67, 71]], [36, [64, 67, 72]], [38, [62, 66, 69]], [35, [63, 66, 71]]],   // Em C D B
    bassAt: (s) => (s % 2 ? null : s % 4 === 2 ? 12 : 0),                                      // driving eighths, octave jumps
    bassLength: 1.6,
    leadAt: (s) => [0, 1, 2, 3, 2, 1][s % 6],                                                  // 3 = root an octave up
  },
};

let master = null;        // music bus: volume slider and mute
let volume = 0.6;
let muted = false;
let wanted = 'menu';      // which loop the game state asks for
const players = [];       // playing loops (two while crossfading)
let timer = null;

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);
const level = () => (muted ? 0 : volume);

function note(ctx, out, midi, time, length, { type, volume: v }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq(midi);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(v, time + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, time + length);
  o.connect(g).connect(out);
  o.start(time);
  o.stop(time + length + 0.02);
}

// Schedules every step of one loop that falls inside the lookahead window.
function schedule(ctx, p) {
  const t = TRACKS[p.name];
  const stepLen = 60 / t.bpm / t.stepsPerBeat;
  if (p.next < ctx.currentTime - 0.05) p.next = ctx.currentTime + 0.02;   // tab was asleep: skip, don't burst
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

// Fades the current loop out and the wanted one in.
function sync() {
  const ctx = audioContext();
  if (!ctx) return;                       // no click or key press yet: stay silent
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

// 0..1, from the Music volume slider.
export function setMusicVolume(value) { volume = Math.min(1, Math.max(0, value)); applyLevel(); }
export function setMusicMuted(value) { muted = !!value; applyLevel(); }
export const currentTrack = () => players.find((p) => !p.stopAt)?.name ?? null;

export function initMusic() {
  // Battle music while a battle is on screen (paused or in a puzzle too), menu music otherwise.
  on('game:state', ({ state }) => {
    wanted = ['playing', 'puzzle', 'paused'].includes(state) ? 'battle' : 'menu';
    sync();
  });
  // Browsers block sound until the player clicks or presses a key: start on the first one.
  const start = () => {
    unlockAudio();
    sync();
    document.removeEventListener('pointerdown', start, true);
    document.removeEventListener('keydown', start, true);
  };
  document.addEventListener('pointerdown', start, true);
  document.addEventListener('keydown', start, true);
}
