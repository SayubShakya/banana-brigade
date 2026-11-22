// Unit tests for bot difficulty settings: bots were too strong, so these check the
// new tuning is weaker than before but Easy, Medium and Hard still rise in order.
const test = require('node:test');
const assert = require('node:assert/strict');
const { DIFFICULTY } = require('../../client/src/game/config.js');
const { RAMP } = require('../../client/src/game/campaign.js');
const { aimSpread } = require('../../client/src/game/bots.js');

// The old difficulty values, kept here so the tests can compare against them.
const BEFORE = {
  easy: { accuracy: [0.10, 0.35], reaction: 1.2, damage: 0.4 },
  medium: { accuracy: [0.30, 0.55], reaction: 0.75, damage: 0.65 },
  hard: { accuracy: [0.55, 0.90], reaction: 0.35, damage: 1 },
};

// Proves every level is now less accurate, slower to react and does less damage than before.
test('every difficulty is weaker than the old tuning', () => {
  for (const [key, old] of Object.entries(BEFORE)) {
    const now = DIFFICULTY[key];
    assert.ok(now.accuracy[0] < old.accuracy[0], `${key} min accuracy`);
    assert.ok(now.accuracy[1] <= old.accuracy[1] * 0.85, `${key} max accuracy`);
    assert.ok(now.reaction > old.reaction, `${key} reaction`);
    assert.ok(now.damage <= old.damage * 0.8, `${key} damage`);
  }
});

// Proves the levels still go up from Easy to Hard, so the choice still means something.
test('difficulties still rise from Easy to Hard', () => {
  const { easy, medium, hard } = DIFFICULTY;
  assert.ok(easy.accuracy[1] < medium.accuracy[1] && medium.accuracy[1] < hard.accuracy[1]);
  assert.ok(easy.reaction > medium.reaction && medium.reaction > hard.reaction);
  assert.ok(easy.damage < medium.damage && medium.damage < hard.damage);
});

// Proves Hard bots fire in short bursts with pauses instead of a constant stream.
test('Hard bots fire in short bursts with pauses', () => {
  assert.ok(DIFFICULTY.hard.pause > 0);
  assert.ok(DIFFICULTY.hard.burst <= 1.5);
});

// Proves the campaign difficulty ramp is gentle and has a cap.
test('campaign ramp is gentler and capped', () => {
  assert.equal(RAMP.accuracy, 0.03);
  assert.equal(RAMP.reaction, 0.95);
  assert.equal(RAMP.cap, 0.8);
});

// Proves bot aim gets less accurate the further away the target is.
test('aim error grows more at long range', () => {
  const acc = 0.5;
  assert.equal(aimSpread(acc, 0), 0);
  assert.ok(Math.abs(aimSpread(acc, 400) - (1.2 - acc) * 400 * 0.26) < 1e-9);
  assert.ok(aimSpread(acc, 1400) > (1.2 - acc) * 300);
  assert.ok(aimSpread(acc, 1400) > aimSpread(acc, 800));
});

// Proves easy bots wait before shooting, but never more than a fifth of a short match.
test('easy bots hold fire for at most a fifth of a short match', () => {
  const { hesitationFor } = require('../../client/src/game/bots.js');
  assert.equal(hesitationFor(30), 6);
  assert.equal(hesitationFor(300), 30);
  assert.equal(hesitationFor(Infinity), 30);
});
