// cutsceneBridge.js: lets any code (controllers or the game engine) play a short story clip.
// The <Cutscene /> component registers itself as the player; this file decides when a clip
// may play (once only, settings, reduced motion) and emits 'cutscene:started' / 'cutscene:ended'.
import { store } from './storage.js';
import { emit } from './eventBus.js';

// Clip id -> caption text. The video files live at /media/clips/<id>.mp4 (poster .jpg).
export const CUTSCENES = {
  logo: 'Banana Brigade',
  deploy: 'Puzzle solved: drop into battle',
  respawn: 'Banana respawn: solve it and you are back',
  intro: 'The Banana Brigade flies in',
  crate: 'A banana crate bursts open with five powers',
  'chapter-1': 'Chapter 1: the campaign begins',
  'chapter-2': 'Chapter 2: four battlefields',
  'chapter-3': 'Chapter 3: the final battle',
  victory: 'Victory! The golden banana is yours',
  defeat: 'Good fight, soldier. The Brigade regroups.',
  rankup: 'Rank up!',
  daily: 'Daily challenge complete',
};

const SEEN_KEY = 'clipsSeen';
const clipUrl = (id, ext) => `/media/clips/${id}.${ext}`;

let player = null;
let open = false;

/**
 * registerCutscenePlayer: called by the Cutscene component when it mounts.
 * @param {Function} fn  plays one clip and resolves when it ends (or 'skipped').
 * @returns {Function} cleanup that unregisters the player on unmount.
 */
export function registerCutscenePlayer(fn) {
  player = fn;
  return () => { if (player === fn) player = null; };
}

export const isCutsceneOpen = () => open;

/** storyClipsEnabled: true unless the player switched story clips off in Settings. */
export function storyClipsEnabled() {
  try { return JSON.parse(store.get('settings', '{}')).storyClips !== false; } catch { return true; }
}

// The ids of clips already watched are saved in localStorage so "once" clips do not repeat.
function seenSet() {
  try { return new Set(JSON.parse(store.get(SEEN_KEY, '[]'))); } catch { return new Set(); }
}

export const hasSeenCutscene = (id) => seenSet().has(id);

function markSeen(id) {
  const seen = seenSet();
  seen.add(id);
  store.set(SEEN_KEY, JSON.stringify([...seen]));
}

export function resetSeenCutscenes() {
  store.set(SEEN_KEY, '[]');
}

// "Calm" mode: the OS asks for reduced motion, or the player chose Calm in accessibility settings.
const calm = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.body.classList.contains('a11y-calm');

/**
 * playCutscene: play one story clip full screen and wait until it finishes.
 * @param {string} id  a key of CUTSCENES.
 * @param {{once?: boolean}} [options]  once = only ever show it the first time.
 * @returns {Promise<boolean>} true if a clip was shown, false if it was skipped by the rules.
 * Emits 'cutscene:started' and 'cutscene:ended' so the game can pause its sounds.
 */
export async function playCutscene(id, { once = true } = {}) {
  if (!(id in CUTSCENES) || open || !player || !storyClipsEnabled()) return false;
  if (once && hasSeenCutscene(id)) return false;
  if (once) markSeen(id);
  open = true;
  const previous = document.body.dataset.overlay;
  document.body.dataset.overlay = 'cutscene';
  emit('cutscene:started', { id });
  let skipped = false;
  try {
    skipped = (await player({ id, src: clipUrl(id, 'mp4'), poster: clipUrl(id, 'jpg'), caption: CUTSCENES[id], calm: calm() })) === 'skipped';
    return true;
  } catch {
    return false;
  // Always restore the previous overlay state and announce the end, even if the clip failed.
  } finally {
    open = false;
    if (previous) document.body.dataset.overlay = previous;
    else delete document.body.dataset.overlay;
    emit('cutscene:ended', { id, skipped });
  }
}
