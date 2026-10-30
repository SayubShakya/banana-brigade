// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { on } from './eventBus.js';

export const store = {
  get(key, fallback) { try { return localStorage.getItem(`brigade.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`brigade.${key}`, value); } catch { } },
};
export const readJson = (key, fallback) => { try { return { ...fallback, ...JSON.parse(store.get(key, '{}')) }; } catch { return { ...fallback }; } };

export const puzzleStats = readJson('stats', { solved: 0, attempts: 0, streak: 0, best: 0 });
on('banana:answered', ({ correct }) => {
  puzzleStats.attempts += 1;
  if (correct) { puzzleStats.solved += 1; puzzleStats.streak += 1; puzzleStats.best = Math.max(puzzleStats.best, puzzleStats.streak); } else puzzleStats.streak = 0;
  store.set('stats', JSON.stringify(puzzleStats));
});
