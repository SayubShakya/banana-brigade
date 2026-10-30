// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');

const GRADES = [['gold', 5000], ['silver', 10000]];

function gradeFor(ms, correct) {
  if (!correct) return null;
  return GRADES.find(([, limit]) => ms < limit)?.[0] ?? 'bronze';
}

function createPuzzleStore({ ttlMs = 5 * 60 * 1000, maxSize = 5000, now = () => Date.now() } = {}) {
  const puzzles = new Map();

  function sweep() {
    const cutoff = now() - ttlMs;
    for (const [id, p] of puzzles) if (p.createdAt < cutoff) puzzles.delete(id);
    while (puzzles.size > maxSize) puzzles.delete(puzzles.keys().next().value);
  }

  return {
    add(solution, purpose) {
      sweep();
      const id = crypto.randomUUID();
      puzzles.set(id, { solution, purpose, createdAt: now() });
      return id;
    },
    answer(id, answer) {
      sweep();
      const p = puzzles.get(id);
      if (!p) return null;
      puzzles.delete(id);
      const correct = answer === p.solution;
      const ms = Math.max(0, now() - p.createdAt);
      return { correct, solution: p.solution, purpose: p.purpose, ms, grade: gradeFor(ms, correct) };
    },
    get size() { return puzzles.size; },
  };
}

module.exports = { createPuzzleStore, gradeFor, GRADES };
