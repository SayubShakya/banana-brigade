// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, updateWorld, revive, damage, bananaAnswered, fillBananaMeter, callSupplyDrop, openSupplyCrate, powerChoices } = require('../../client/src/game/world.js');
const { meterGain, applyAnswer, crateChoiceCount, spawnShieldFor } = require('../../client/src/game/meter.js');
const { BANANA_METER, SOLDIER } = require('../../client/src/game/config.js');

function world() {
  const events = [];
  const w = createWorld({
    mode: 'training', playerName: 'Tester', playerAvatar: {}, botAvatars: [{ bot: 0 }], botNames: ['Dummy'],
    emit: (name, payload) => events.push({ name, payload }),
  });
  return { w, p: w.player, events };
}

test('meter gain depends on the grade and grows with the streak up to double', () => {
  assert.equal(meterGain('gold', 0), 40);
  assert.equal(meterGain('silver', 0), 30);
  assert.equal(meterGain('bronze', 0), 20);
  assert.equal(meterGain('bronze', 3), 40);
  assert.equal(meterGain('silver', 30), 60);
  assert.equal(meterGain(null, 0), 0);
});

test('a wrong answer halves the streak but never wipes the meter', () => {
  assert.deepEqual(applyAnswer({ value: 50, streak: 5 }, { correct: false }), { value: 50, streak: 2, gained: 0, full: false });
  assert.deepEqual(applyAnswer({ value: 50, streak: 1 }, { correct: false }), { value: 50, streak: 0, gained: 0, full: false });
  assert.deepEqual(applyAnswer({ value: 90, streak: 0 }, { correct: true, grade: 'gold' }), { value: 100, streak: 1, gained: 40, full: true });
});

test('correct answers fill the player meter and emit banana:meter', () => {
  const { w, p, events } = world();
  bananaAnswered(w, p, { correct: true, grade: 'gold' });
  bananaAnswered(w, p, { correct: true, grade: 'silver' });
  assert.equal(p.meter, 40 + 40);
  assert.equal(p.bananaStreak, 2);
  bananaAnswered(w, p, { correct: false });
  assert.equal(p.bananaStreak, 1);
  assert.equal(p.meter, 80);
  const last = events.filter((e) => e.name === 'banana:meter').at(-1).payload;
  assert.deepEqual({ value: last.value, streak: last.streak, gained: last.gained }, { value: 80, streak: 1, gained: 0 });
});

test('a full meter calls a supply drop crate that opens without a puzzle', () => {
  const { w, p, events } = world();
  assert.equal(callSupplyDrop(w, p), null, 'no drop before the meter is full');
  fillBananaMeter(w, p);
  const crate = callSupplyDrop(w, p);
  assert.ok(crate && crate.supply && crate.kind === 'banana' && crate.active);
  assert.equal(p.meter, 0);
  assert.equal(p.drops, 1);
  const drop = events.find((e) => e.name === 'banana:drop');
  assert.deepEqual({ x: drop.payload.x, y: drop.payload.y }, { x: crate.x, y: crate.y });
  assert.ok(Math.abs(crate.x - (p.x + p.w / 2)) <= BANANA_METER.dropOffset);
  assert.ok(Math.abs(crate.x - (p.x + p.w / 2)) <= 26 && Math.abs(crate.y - (p.y + p.h / 2)) <= 36, 'the drop lands within E reach, no walking needed');
  openSupplyCrate(crate);
  updateWorld(w, 1 / 60);
  assert.ok(!w.pickups.includes(crate), 'an opened supply crate is gone for good');
});

test('a supply drop called in mid-air lands on the ground below the soldier', () => {
  const { w, p } = world();
  const standing = p.y;
  p.y -= 200;
  fillBananaMeter(w, p);
  const crate = callSupplyDrop(w, p);
  assert.ok(Math.abs(crate.y - (standing + p.h / 2)) <= 36, 'the crate is within E reach once the soldier lands');
});

test('standing on a supply crate and pressing E asks for a free power', () => {
  const { w, p, events } = world();
  fillBananaMeter(w, p);
  const crate = callSupplyDrop(w, p);
  crate.x = p.x + p.w / 2;
  crate.y = p.y + p.h / 2;
  p.controls.pickup = true;
  updateWorld(w, 1 / 60);
  const ask = events.find((e) => e.name === 'banana:crate');
  assert.ok(ask && ask.payload.supply && ask.payload.pickup === crate);
});

test('grades change crate choices and the respawn shield', () => {
  assert.equal(crateChoiceCount('gold'), 4);
  assert.equal(crateChoiceCount('silver'), 3);
  assert.equal(crateChoiceCount('bronze'), 2);
  assert.equal(crateChoiceCount(null), 3);
  assert.equal(powerChoices(crateChoiceCount('gold')).length, 4);
  assert.equal(powerChoices(crateChoiceCount('bronze')).length, 2);
  assert.equal(spawnShieldFor('gold'), BANANA_METER.goldShield);
  assert.equal(spawnShieldFor('silver'), null);

  const { w, p } = world();
  p.shieldTimer = 0;
  damage(w, p, SOLDIER.maxHealth * 2, null, 'Test');
  assert.equal(p.alive, false);
  revive(w, p, 'gold');
  assert.equal(p.shieldTimer, BANANA_METER.goldShield);
  p.shieldTimer = 0;
  damage(w, p, SOLDIER.maxHealth * 2, null, 'Test');
  revive(w, p, 'bronze');
  assert.equal(p.shieldTimer, SOLDIER.spawnShield);
});
