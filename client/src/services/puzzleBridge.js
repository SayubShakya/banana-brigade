// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { emit } from './eventBus.js';

let opener = null;
let closer = null;
let open = false;

export function registerPuzzleOpener(fn, close) {
  opener = fn;
  closer = close;
  return () => { if (opener === fn) { opener = null; closer = null; } };
}

export function closePuzzle() {
  if (open) closer?.();
}

export const isPuzzleOpen = () => open;

export async function askPuzzle(purpose, options = {}) {
  if (open || !opener) return 'cancelled';
  open = true;
  document.body.dataset.overlay = 'puzzle';
  emit('puzzle:shown', { purpose });
  try {
    return await opener(purpose, options);
  } finally {
    open = false;
    delete document.body.dataset.overlay;
    emit('puzzle:hidden', { purpose });
  }
}
