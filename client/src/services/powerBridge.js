// powerBridge.js: connects the game engine to the <PowerPicker /> overlay.
// The engine calls askPower(); the PowerPicker component registers the function that shows it.
let opener = null;
let closer = null;
let open = false;

/**
 * registerPowerOpener: called by PowerPicker on mount.
 * @param {Function} fn     shows the picker and resolves with the chosen power.
 * @param {Function} close  closes the picker early.
 * @returns {Function} cleanup to unregister.
 */
export function registerPowerOpener(fn, close) {
  opener = fn;
  closer = close;
  return () => { if (opener === fn) { opener = null; closer = null; } };
}

/** closePower: close the picker if it is open (e.g. the match ended). */
export function closePower() {
  if (open) closer?.();
}

export const isPowerOpen = () => open;

/**
 * askPower: show the super power choices and wait for the player.
 * @param {Array} choices   the powers to offer.
 * @param {number} seconds  time limit before a random power is picked.
 * @returns {Promise<string>} the chosen power id, or 'random' if the picker is unavailable.
 */
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
