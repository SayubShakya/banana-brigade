// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

let opener = null;
let closer = null;
let open = false;

export function registerPowerOpener(fn, close) {
  opener = fn;
  closer = close;
  return () => { if (opener === fn) { opener = null; closer = null; } };
}

export function closePower() {
  if (open) closer?.();
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
