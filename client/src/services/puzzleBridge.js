// puzzleBridge.js: connects game code to the <PuzzleModal /> (Banana API puzzle) overlay.
// Callers just await askPuzzle('deploy' | 'respawn' | 'crate'); the modal does the API work.
import { emit } from './eventBus.js';

let opener = null;
let closer = null;
let open = false;

/**
 * registerPuzzleOpener: called by PuzzleModal on mount.
 * @param {Function} fn     opens the modal and resolves with 'solved' | 'failed' | 'cancelled'.
 * @param {Function} close  closes the modal early.
 * @returns {Function} cleanup to unregister.
 */
export function registerPuzzleOpener(fn, close) {
  opener = fn;
  closer = close;
  return () => { if (opener === fn) { opener = null; closer = null; } };
}

/** closePuzzle: close the puzzle if it is open. */
export function closePuzzle() {
  if (open) closer?.();
}

export const isPuzzleOpen = () => open;

/**
 * askPuzzle: open the Banana puzzle and wait for the result.
 * @param {string} purpose  why the puzzle is needed: 'deploy', 'respawn' or 'crate'.
 * @param {object} [options]  title, subtitle, modeLabel and time limit (seconds).
 * @returns {Promise<string>} the result, or 'cancelled' if a puzzle is already open.
 * Emits 'puzzle:shown' and 'puzzle:hidden' so the game can pause input meanwhile.
 */
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
