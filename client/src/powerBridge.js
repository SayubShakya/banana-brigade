// Lets the game (plain JavaScript) open the React power picker and wait for the
// choice: askPower(choices) resolves to a power id or 'random'.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

let opener = null;
let open = false;

export function registerPowerOpener(fn) {
  opener = fn;
  return () => { if (opener === fn) opener = null; };
}

export const isPowerOpen = () => open;

export async function askPower(choices, seconds) {
  if (open || !opener) return 'random';
  open = true;
  document.body.dataset.overlay = 'power';
  try {
    return await opener(choices, seconds);
  } finally {
    open = false;
    delete document.body.dataset.overlay;
  }
}
