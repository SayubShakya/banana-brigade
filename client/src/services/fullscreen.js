// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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
  } catch { }
}

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
