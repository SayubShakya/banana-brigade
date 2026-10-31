// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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

  async function answer(userId, { puzzleId, answer: given }, tally) {
    if (typeof puzzleId !== 'string' || !Number.isInteger(given)) throw badRequest('Send { puzzleId, answer } with a whole-number answer');
    const result = puzzleStore.answer(puzzleId, given);
    if (!result) throw notFound('That puzzle has expired or was already answered');
    tally.record(result.correct, result.purpose);
    const unlocked = await achievements.emit('puzzle:answered', userId, result);
    return { correct: result.correct, solution: result.solution, purpose: result.purpose, ms: result.ms, grade: result.grade, unlocked };
  }

  const status = () => pool.status();

  return { issue, answer, status };
}

module.exports = { createPuzzleService, PURPOSES };
