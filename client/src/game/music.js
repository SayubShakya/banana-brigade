// Background music. Listens to event bus events (game state, puzzles, cutscenes) and
// cross-fades between the menu, battle and puzzle tracks using HTML Audio elements.
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
// The volume we want right now: silent if muted, the tab is hidden, or a video is playing.
const level = () => (muted || hidden() || videoPlaying > 0 ? 0 : volume);

// Creates (once) a looping Audio element for a track. If a file fails to load, it falls back to the menu track.
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

/**
 * Fades the wanted track to the current level and every other track to 0,
 * in small steps every 50 ms over FADE_MS. Silent tracks are paused at the end.
 */
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
// Which track is playing (null before the first click/key, because browsers block autoplay).
export const currentTrack = () => (started ? wanted : null);

/**
 * Starts the music system. Listens to the event bus:
 *  - 'game:state' -> battle music while playing, menu music otherwise
 *  - 'puzzle:shown' / 'puzzle:hidden' -> puzzle music while a puzzle is open
 *  - 'cutscene:*' / 'media:*' -> mute music while a video plays
 * Music only starts after the first pointer or key press (browser autoplay rule).
 */
export function initMusic() {
  const choose = () => {
    // A puzzle on screen wins over the scene. The battle track keeps its position when we return to it.
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
  // Counts open videos (+1 when one starts, -1 when it ends) so overlapping videos are handled.
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
