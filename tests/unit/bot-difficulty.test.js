// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { DIFFICULTY } = require('../../client/src/game/config.js');
const { RAMP } = require('../../client/src/game/campaign.js');
const { aimSpread } = require('../../client/src/game/bots.js');

const BEFORE = {
  easy: { accuracy: [0.10, 0.35], reaction: 1.2, damage: 0.4 },
  medium: { accuracy: [0.30, 0.55], reaction: 0.75, damage: 0.65 },
  hard: { accuracy: [0.55, 0.90], reaction: 0.35, damage: 1 },
};

test('every difficulty is weaker than the old tuning', () => {
  for (const [key, old] of Object.entries(BEFORE)) {
    const now = DIFFICULTY[key];
    assert.ok(now.accuracy[0] < old.accuracy[0], `${key} min accuracy`);
    assert.ok(now.accuracy[1] <= old.accuracy[1] * 0.85, `${key} max accuracy`);
    assert.ok(now.reaction > old.reaction, `${key} reaction`);
    assert.ok(now.damage <= old.damage * 0.8, `${key} damage`);
  }
});

test('difficulties still rise from Easy to Hard', () => {
  const { easy, medium, hard } = DIFFICULTY;
  assert.ok(easy.accuracy[1] < medium.accuracy[1] && medium.accuracy[1] < hard.accuracy[1]);
  assert.ok(easy.reaction > medium.reaction && medium.reaction > hard.reaction);
  assert.ok(easy.damage < medium.damage && medium.damage < hard.damage);
});

test('Hard bots fire in short bursts with pauses', () => {
  assert.ok(DIFFICULTY.hard.pause > 0);
  assert.ok(DIFFICULTY.hard.burst <= 1.5);
});

test('campaign ramp is gentler and capped', () => {
  assert.equal(RAMP.accuracy, 0.03);
  assert.equal(RAMP.reaction, 0.95);
  assert.equal(RAMP.cap, 0.8);
});

test('aim error grows more at long range', () => {
  const acc = 0.5;
  assert.equal(aimSpread(acc, 0), 0);
  assert.ok(Math.abs(aimSpread(acc, 400) - (1.2 - acc) * 400 * 0.26) < 1e-9);
  assert.ok(aimSpread(acc, 1400) > (1.2 - acc) * 300);
  assert.ok(aimSpread(acc, 1400) > aimSpread(acc, 800));
});

test('easy bots hold fire for at most a fifth of a short match', () => {
  const { hesitationFor } = require('../../client/src/game/bots.js');
  assert.equal(hesitationFor(30), 6);
  assert.equal(hesitationFor(300), 30);
  assert.equal(hesitationFor(Infinity), 30);
});
