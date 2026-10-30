// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPuzzleStore, gradeFor } = require('../../server/services/puzzles');
const { createPuzzleService } = require('../../server/services/puzzleService');

test('the speed grade has sharp boundaries at 5 s and 10 s', () => {
  assert.equal(gradeFor(0, true), 'gold');
  assert.equal(gradeFor(4999, true), 'gold');
  assert.equal(gradeFor(5000, true), 'silver');
  assert.equal(gradeFor(9999, true), 'silver');
  assert.equal(gradeFor(10000, true), 'bronze');
  assert.equal(gradeFor(60000, true), 'bronze');
  assert.equal(gradeFor(1000, false), null);
});

test('the puzzle store times each answer with its own clock', () => {
  let clock = 1000;
  const store = createPuzzleStore({ now: () => clock });
  const fast = store.add(4, 'crate');
  const slow = store.add(6, 'respawn');
  const wrong = store.add(2, 'deploy');
  clock += 3200;
  assert.deepEqual(store.answer(fast, 4), { correct: true, solution: 4, purpose: 'crate', ms: 3200, grade: 'gold' });
  clock += 8000;
  assert.deepEqual(store.answer(slow, 6), { correct: true, solution: 6, purpose: 'respawn', ms: 11200, grade: 'bronze' });
  assert.deepEqual(store.answer(wrong, 3), { correct: false, solution: 2, purpose: 'deploy', ms: 11200, grade: null });
});

test('the answer response carries ms and grade', async () => {
  let clock = 0;
  const puzzleStore = createPuzzleStore({ now: () => clock });
  const pool = { take: async () => ({ image: 'data:image/png;base64,x', solution: 7, source: 'live' }) };
  const achievements = { emit: async () => [] };
  const service = createPuzzleService({ pool, puzzleStore, achievements });
  const tally = { record() {} };
  const { puzzleId } = await service.issue('crate');
  clock = 7500;
  const res = await service.answer('u1', { puzzleId, answer: 7 }, tally);
  assert.deepEqual(res, { correct: true, solution: 7, purpose: 'crate', ms: 7500, grade: 'silver', unlocked: [] });
});
