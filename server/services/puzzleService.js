// Service layer: hands out Banana API puzzles and checks answers.
// The solution never leaves the server; the browser only gets the image and a puzzleId.

const { AppError, badRequest, notFound } = require('../lib/errors');

// Why a puzzle is shown: to deploy into a match, to respawn, or to open a banana crate.
const PURPOSES = ['deploy', 'respawn', 'crate'];

/**
 * Creates the puzzle service.
 * @param {object} deps pool (Banana API puzzle pool), puzzleStore (pending answers), achievements (event bus)
 */
function createPuzzleService({ pool, puzzleStore, achievements }) {
  /**
   * Gives the player a new puzzle.
   * @param {string} askedPurpose 'deploy' | 'respawn' | 'crate' (anything else becomes 'deploy')
   * @returns {Promise<{puzzleId, image, purpose, source}>} source says whether it came live from the API or the reserve
   * @throws 502 if no puzzle could be got from the Banana API or the reserve
   */
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

  /**
   * Checks the player's answer against the solution kept on the server.
   * Each puzzle can only be answered once (it is removed from the store).
   * Fires the 'puzzle:answered' event so achievements can react.
   * @param {object} tally session puzzle counter (see lib/httpSession.js)
   * @returns {Promise<object>} correct, solution, speed grade and any achievements unlocked
   * @throws 400 for a bad body; 404 if the puzzle expired or was already answered
   */
  async function answer(userId, { puzzleId, answer: given }, tally) {
    // Validation: the answer must be a whole number.
    if (typeof puzzleId !== 'string' || !Number.isInteger(given)) throw badRequest('Send { puzzleId, answer } with a whole-number answer');
    const result = puzzleStore.answer(puzzleId, given);
    if (!result) throw notFound('That puzzle has expired or was already answered');
    tally.record(result.correct, result.purpose);
    const unlocked = await achievements.emit('puzzle:answered', userId, result);
    return { correct: result.correct, solution: result.solution, purpose: result.purpose, ms: result.ms, grade: result.grade, unlocked };
  }

  // Health of the puzzle pool (for the status page).
  const status = () => pool.status();

  return { issue, answer, status };
}

module.exports = { createPuzzleService, PURPOSES };
