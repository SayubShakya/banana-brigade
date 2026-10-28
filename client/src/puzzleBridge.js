// Lets plain JavaScript (the game session) open the React puzzle window and wait
// for the result: askPuzzle(purpose, options) resolves to 'solved', 'failed' or
// 'cancelled'. The PuzzleModal component registers itself here when it mounts.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

let opener = null;
let open = false;

export function registerPuzzleOpener(fn) {
  opener = fn;
  return () => { if (opener === fn) opener = null; };
}

export const isPuzzleOpen = () => open;

export async function askPuzzle(purpose, options = {}) {
  if (open || !opener) return 'cancelled';
  open = true;
  document.body.dataset.overlay = 'puzzle';
  try {
    return await opener(purpose, options);
  } finally {
    open = false;
    delete document.body.dataset.overlay;
  }
}
