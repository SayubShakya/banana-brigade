// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { readJson, store } from '../services/storage.js';
import { game } from './gameEngine.js';

// Saved settings. Older saves had one on/off "sound" switch: it becomes the mute.
const DEFAULT_SETTINGS = {
  musicVolume: 60, sfxVolume: 80, muted: false, laser: true, banners: true, fps: false, autoFire: true, difficulty: 'medium',
  contrast: false, largeText: false, calm: false,
};
function loadSettings() {
  const { sound, ...saved } = readJson('settings', DEFAULT_SETTINGS);
  const withDefaults = { ...DEFAULT_SETTINGS, ...saved };   // new options (e.g. autoFire) get their default
  return sound === false ? { ...withDefaults, muted: true } : withDefaults;
}

// The player's settings: loaded from and saved to the browser, applied to the game.
export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => { game().applySettings(settings); }, [settings]);

  // Accessibility settings are classes on <body>; the CSS does the rest.
  useEffect(() => {
    document.body.classList.toggle('a11y-contrast', !!settings.contrast);
    document.body.classList.toggle('a11y-large', !!settings.largeText);
    document.body.classList.toggle('a11y-calm', !!settings.calm);
  }, [settings.contrast, settings.largeText, settings.calm]);

  const setSetting = (key, value) => setSettings((s) => {
    const next = { ...s, [key]: typeof value === 'function' ? value(s[key]) : value };
    store.set('settings', JSON.stringify(next));
    return next;
  });
  const toggle = (key) => setSetting(key, (v) => !v);

  return { settings, setSetting, toggle };
}
