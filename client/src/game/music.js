// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../services/eventBus.js';

const FADE_MS = 1200;
const TRACKS = {
  menu: '/media/music/theme.mp3',
  battle: '/media/music/battle.mp3',
  puzzle: '/media/music/puzzle.mp3',
};

let volume = 0.4;
let muted = false;
let wanted = 'menu';
let scene = 'menu';
let puzzles = 0;
let videoPlaying = 0;
let started = false;
const players = {};
let fadeTimer = null;

const hidden = () => typeof document !== 'undefined' && document.hidden;
const level = () => (muted || hidden() || videoPlaying > 0 ? 0 : volume);

function player(name) {
  if (players[name]) return players[name];
  const a = new Audio(TRACKS[name]);
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  a.addEventListener('error', () => { if (name !== 'menu') TRACKS[name] = TRACKS.menu; });
  players[name] = a;
  return a;
}

function fadeTo() {
  if (!started) return;
  clearInterval(fadeTimer);
  const target = level();
  const active = player(wanted);
  if (target > 0 && active.paused) active.play().catch(() => {});
  const steps = Math.max(1, Math.round(FADE_MS / 50));
  let i = 0;
  const from = Object.fromEntries(Object.entries(players).map(([k, a]) => [k, a.volume]));
  fadeTimer = setInterval(() => {
    i += 1;
    const t = i / steps;
    for (const [k, a] of Object.entries(players)) {
      const goal = k === wanted ? target : 0;
      a.volume = Math.min(1, Math.max(0, from[k] + (goal - from[k]) * t));
      if (i >= steps && a.volume === 0 && !a.paused) a.pause();
    }
    if (i >= steps) clearInterval(fadeTimer);
  }, 50);
}

export function setMusicVolume(value) { volume = Math.min(1, Math.max(0, value)); fadeTo(); }
export function setMusicMuted(value) { muted = !!value; fadeTo(); }
export const currentTrack = () => (started ? wanted : null);

export function initMusic() {
  const choose = () => {
    const next = puzzles > 0 ? 'puzzle' : scene;
    if (next !== wanted) { wanted = next; if (players[wanted] && next !== 'battle') players[wanted].currentTime = 0; }
    fadeTo();
  };
  on('game:state', ({ state }) => {
    scene = ['playing', 'puzzle', 'paused'].includes(state) ? 'battle' : 'menu';
    choose();
  });
  on('puzzle:shown', () => { puzzles += 1; choose(); });
  on('puzzle:hidden', () => { puzzles = Math.max(0, puzzles - 1); choose(); });
  const pauseFor = (d) => () => { videoPlaying = Math.max(0, videoPlaying + d); fadeTo(); };
  on('cutscene:started', pauseFor(1));
  on('cutscene:ended', pauseFor(-1));
  on('media:started', pauseFor(1));
  on('media:ended', pauseFor(-1));
  document.addEventListener('visibilitychange', fadeTo);
  const start = () => {
    started = true;
    fadeTo();
    document.removeEventListener('pointerdown', start, true);
    document.removeEventListener('keydown', start, true);
  };
  document.addEventListener('pointerdown', start, true);
  document.addEventListener('keydown', start, true);
}
