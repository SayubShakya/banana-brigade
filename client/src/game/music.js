// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../services/eventBus.js';

const FADE_MS = 1200;
const TRACKS = {
  menu: '/media/music/theme.mp3',
  battle: '/media/music/battle.mp3',
};

let volume = 0.4;
let muted = false;
let wanted = 'menu';
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
  a.addEventListener('error', () => { if (name === 'battle') TRACKS.battle = TRACKS.menu; });
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
  on('game:state', ({ state }) => {
    const next = ['playing', 'puzzle', 'paused'].includes(state) ? 'battle' : 'menu';
    if (next !== wanted) { wanted = next; if (players[wanted]) players[wanted].currentTime = 0; }
    fadeTo();
  });
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
