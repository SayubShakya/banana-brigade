// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { store } from './storage.js';
import { emit } from './eventBus.js';

export const CUTSCENES = {
  intro: 'The Banana Brigade flies in',
  crate: 'A banana crate bursts open with five powers',
  'chapter-1': 'Chapter 1: the campaign begins',
  'chapter-2': 'Chapter 2: four battlefields',
  'chapter-3': 'Chapter 3: the final battle',
  victory: 'Victory! The golden banana is yours',
  rankup: 'Rank up!',
  daily: 'Daily challenge complete',
};

const SEEN_KEY = 'clipsSeen';
const clipUrl = (id, ext) => `/media/clips/${id}.${ext}`;

let player = null;
let open = false;

export function registerCutscenePlayer(fn) {
  player = fn;
  return () => { if (player === fn) player = null; };
}

export const isCutsceneOpen = () => open;

export function storyClipsEnabled() {
  try { return JSON.parse(store.get('settings', '{}')).storyClips !== false; } catch { return true; }
}

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

const calm = () => (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.body.classList.contains('a11y-calm');

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
  } finally {
    open = false;
    if (previous) document.body.dataset.overlay = previous;
    else delete document.body.dataset.overlay;
    emit('cutscene:ended', { id, skipped });
  }
}
