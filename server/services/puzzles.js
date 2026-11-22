// Service layer: in-memory store of puzzles waiting for an answer.
// Keeps each solution on the server and times how fast the player answers.

const crypto = require('node:crypto');

// Speed grades: under 5 s = gold, under 10 s = silver, otherwise bronze.
const GRADES = [['gold', 5000], ['silver', 10000]];

/**
 * Works out the speed grade for an answer.
 * @param {number} ms time taken in milliseconds
 * @param {boolean} correct wrong answers get no grade
 * @returns {'gold'|'silver'|'bronze'|null}
 */
function gradeFor(ms, correct) {
  if (!correct) return null;
  return GRADES.find(([, limit]) => ms < limit)?.[0] ?? 'bronze';
}

/**
 * Creates the pending puzzle store (a Map of puzzleId -> solution).
 * @param {object} opts ttlMs: puzzles expire after 5 minutes; maxSize: at most 5000 kept
 */
function createPuzzleStore({ ttlMs = 5 * 60 * 1000, maxSize = 5000, now = () => Date.now() } = {}) {
  const puzzles = new Map();

  // Removes expired puzzles, then the oldest ones if there are too many (stops memory growing forever).
  function sweep() {
    const cutoff = now() - ttlMs;
    for (const [id, p] of puzzles) if (p.createdAt < cutoff) puzzles.delete(id);
    while (puzzles.size > maxSize) puzzles.delete(puzzles.keys().next().value);
  }

  return {
    /** Stores a solution and returns a random, unguessable puzzleId. */
    add(solution, purpose) {
      sweep();
      const id = crypto.randomUUID();
      puzzles.set(id, { solution, purpose, createdAt: now() });
      return id;
    },
    /**
     * Checks an answer and deletes the puzzle, so it cannot be answered twice.
     * @returns {object|null} result, or null if the id is unknown or expired
     */
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
