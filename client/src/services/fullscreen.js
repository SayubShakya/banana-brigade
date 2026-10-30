// Fullscreen for the 16:9 game stage (Settings and the pause menu). Uses the
// Fullscreen API, with the older webkit names for Safari; on browsers without it
// (iPhone Safari) the button is simply not shown.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';

const stage = () => document.getElementById('stage');
const current = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

export function fullscreenSupported() {
  const el = stage();
  return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen) && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled));
}

export async function toggleFullscreen() {
  if (!fullscreenSupported()) return;
  try {
    if (current()) await (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
    else {
      const el = stage();
      await (el.requestFullscreen ?? el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    }
  } catch { /* the browser refused (no user gesture or blocked): stay as we are */ }
}

// [isFullscreen, supported], kept up to date when the player presses Esc or F11.
export function useFullscreen() {
  const [on, setOn] = useState(() => !!current());
  useEffect(() => {
    const update = () => setOn(!!current());
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);
  return [on, fullscreenSupported()];
}
