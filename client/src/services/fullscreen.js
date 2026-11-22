// fullscreen.js: helpers to put the game stage (#stage) into browser full screen.
// Uses the standard Fullscreen API with the webkit-prefixed fallback for Safari.
import { useEffect, useState } from 'react';

const stage = () => document.getElementById('stage');
const current = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;

/** fullscreenSupported: true if this browser can make the #stage element full screen. */
export function fullscreenSupported() {
  const el = stage();
  return !!(el && (el.requestFullscreen || el.webkitRequestFullscreen) && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled));
}

/** toggleFullscreen: enter full screen, or leave it if already full screen. Errors are ignored. */
export async function toggleFullscreen() {
  if (!fullscreenSupported()) return;
  try {
    if (current()) await (document.exitFullscreen ?? document.webkitExitFullscreen).call(document);
    else {
      const el = stage();
      await (el.requestFullscreen ?? el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    }
  } catch { }
}

/**
 * useFullscreen: React hook that listens to the browser 'fullscreenchange' events.
 * @returns {[boolean, boolean]} [is full screen now, is full screen supported].
 */
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
