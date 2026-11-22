// storage.js: small wrapper around localStorage (keys are prefixed with "brigade.").
// Reads and writes are in try/catch because private windows can block localStorage.
import { on } from './eventBus.js';

export const store = {
  get(key, fallback) { try { return localStorage.getItem(`brigade.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`brigade.${key}`, value); } catch { } },
};
/** readJson: read a JSON object from storage and merge it over the fallback defaults. */
export const readJson = (key, fallback) => { try { return { ...fallback, ...JSON.parse(store.get(key, '{}')) }; } catch { return { ...fallback }; } };

// Local puzzle statistics, updated whenever the 'banana:answered' event fires
// (emitted by the puzzle modal after the server checks an answer).
export const puzzleStats = readJson('stats', { solved: 0, attempts: 0, streak: 0, best: 0 });
on('banana:answered', ({ correct }) => {
  puzzleStats.attempts += 1;
  if (correct) { puzzleStats.solved += 1; puzzleStats.streak += 1; puzzleStats.best = Math.max(puzzleStats.best, puzzleStats.streak); } else puzzleStats.streak = 0;
  store.set('stats', JSON.stringify(puzzleStats));
});
