// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { readJson, store } from '../services/storage.js';
import { useBus } from '../hooks/useBus.js';
import { game } from './gameEngine.js';

const DEFAULT_SETTINGS = {
  musicVolume: 40, sfxVolume: 80, muted: false, laser: true, banners: true, fps: false, autoFire: true, difficulty: 'easy', matchLength: 300,
  contrast: false, largeText: false, calm: false, bootCampDone: false, bootCampOffered: false, tipsSeen: {},
};
function loadSettings() {
  const { sound, ...saved } = readJson('settings', DEFAULT_SETTINGS);
  const withDefaults = { ...DEFAULT_SETTINGS, ...saved };
  return sound === false ? { ...withDefaults, muted: true } : withDefaults;
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => { game().applySettings(settings); }, [settings]);

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
  useBus('settings:set', ({ key, value }) => { if (key in DEFAULT_SETTINGS) setSetting(key, value); });

  return { settings, setSetting, toggle };
}
