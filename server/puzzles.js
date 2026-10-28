// Keeps the solution of every puzzle handed to a browser, so the answer never
// leaves the server. Each puzzle can be answered once and expires after a while.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');

function createPuzzleStore({ ttlMs = 5 * 60 * 1000, maxSize = 5000, now = () => Date.now() } = {}) {
  const puzzles = new Map(); // id -> { solution, purpose, createdAt }

  function sweep() {
    const cutoff = now() - ttlMs;
    for (const [id, p] of puzzles) if (p.createdAt < cutoff) puzzles.delete(id);
    // Hard cap so a flood of requests cannot grow memory without limit.
    while (puzzles.size > maxSize) puzzles.delete(puzzles.keys().next().value);
  }

  return {
    add(solution, purpose) {
      sweep();
      const id = crypto.randomUUID();
      puzzles.set(id, { solution, purpose, createdAt: now() });
      return id;
    },
    // Returns null when the id is unknown, used or expired; otherwise checks the answer once.
    answer(id, answer) {
      sweep();
      const p = puzzles.get(id);
      if (!p) return null;
      puzzles.delete(id);
      return { correct: answer === p.solution, solution: p.solution, purpose: p.purpose, ms: now() - p.createdAt };
    },
    get size() { return puzzles.size; },
  };
}

module.exports = { createPuzzleStore };
