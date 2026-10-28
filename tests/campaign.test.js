// Tests for the campaign: locked missions are refused, stars are worked out on the
// server, and progress unlocks the next mission.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, fakeApi } = require('./helpers');

test('campaign: locked missions are refused, wins earn stars and unlock the next mission', async () => {
  const s = await startServer({ bananaApi: fakeApi(5) });
  try {
    const c = client(s.base);
    await c.post('/api/auth/register', { username: 'cadet', password: 'bananas123' });
    const start = (await c.get('/api/campaign')).body;
    assert.equal(start.missions.length, 9);
    assert.equal(start.stars, 0);
    assert.equal((await c.post('/api/campaign/result', { mission: 2, won: true, kills: 8, deaths: 0, continues: 0, timeS: 90 })).status, 403);

    // Solve one Banana puzzle, then win mission 1 without a continue: 3 stars.
    const { puzzleId } = (await c.get('/api/puzzle?purpose=respawn')).body;
    await c.post('/api/puzzle/answer', { puzzleId, answer: 5 });
    const win = (await c.post('/api/campaign/result', { mission: 1, won: true, kills: 5, deaths: 1, continues: 0, timeS: 100 })).body;
    assert.equal(win.stars, 3);
    assert.equal(win.unlockedNext, true);
    assert.ok(win.unlocked.some((a) => a.id === 'three_stars'));

    // Claiming a win without reaching the kill target gives no stars.
    const fake = (await c.post('/api/campaign/result', { mission: 2, won: true, kills: 1, deaths: 0, continues: 0, timeS: 30 })).body;
    assert.equal(fake.stars, 0);
    // A worse run never lowers the best result.
    const worse = (await c.post('/api/campaign/result', { mission: 1, won: true, kills: 5, deaths: 4, continues: 1, timeS: 200 })).body;
    assert.deepEqual([worse.stars, worse.best, worse.progress[1].bestS], [1, 3, 100]);
  } finally { await s.close(); }
});
