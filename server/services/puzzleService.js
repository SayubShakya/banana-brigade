// Banana puzzles for the browser. The server takes a puzzle from the pool (fetched
// from the Banana API), keeps the solution in the puzzle store and only hands out
// the picture, so the answer cannot be read in the browser's developer tools.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { AppError, badRequest, notFound } = require('../lib/errors');

const PURPOSES = ['deploy', 'respawn', 'crate'];

function createPuzzleService({ pool, puzzleStore, achievements }) {
  async function issue(askedPurpose) {
    const purpose = PURPOSES.includes(askedPurpose) ? askedPurpose : 'deploy';
    try {
      const { image, solution, source } = await pool.take();
      const puzzleId = puzzleStore.add(solution, purpose);
      return { puzzleId, image, purpose, source };
    } catch (err) {
      console.error('Banana API error:', err.message);
      throw new AppError(502, 'The Banana API is not responding. Try again in a moment.');
    }
  }

  // Each puzzle can be answered once. tally: the session's puzzle record
  // (lib/httpSession.js), kept on the server so it cannot be faked from the browser.
  async function answer(userId, { puzzleId, answer: given }, tally) {
    if (typeof puzzleId !== 'string' || !Number.isInteger(given)) throw badRequest('Send { puzzleId, answer } with a whole-number answer');
    const result = puzzleStore.answer(puzzleId, given);
    if (!result) throw notFound('That puzzle has expired or was already answered');
    tally.record(result.correct);
    const unlocked = await achievements.emit('puzzle:answered', userId, result);
    return { correct: result.correct, solution: result.solution, purpose: result.purpose, unlocked };
  }

  // Banana API health: puzzles ready, latency, success rate and the circuit breaker.
  const status = () => pool.status();

  return { issue, answer, status };
}

module.exports = { createPuzzleService, PURPOSES };
