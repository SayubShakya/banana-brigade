// Tests for Banana Powers: what each power does, how long it lasts, the random
// bonus, crate respawns, and that every map has five banana crates.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, updateWorld, damage, activeGun, rewardBananaCrate, closeBananaCrate, powerChoices } = require('../client/src/game/world.js');
const { POWERS, BANANA_CRATE, PHYSICS, SOLDIER } = require('../client/src/game/config.js');
const { MAPS } = require('../client/src/game/maps.js');
const { createMap } = require('../client/src/game/map.js');

function world() {
  const events = [];
  const w = createWorld({
    mode: 'training', playerName: 'Tester', playerAvatar: {}, botAvatars: [{ bot: 0 }], botNames: ['Dummy'],
    emit: (name, payload) => events.push({ name, payload }),
  });
  const [p, dummy] = [w.player, w.soldiers[1]];
  for (const s of [p, dummy]) s.shieldTimer = 0;
  return { w, p, dummy, events };
}

test('Banana Rage doubles the damage you deal', () => {
  const { w, p, dummy } = world();
  rewardBananaCrate(w, p, 'rage');
  damage(w, dummy, 20, p, 'Test');
  assert.equal(dummy.health, SOLDIER.maxHealth - 40);
});

test('Banana Bubble blocks all damage', () => {
  const { w, p, dummy } = world();
  rewardBananaCrate(w, p, 'bubble');
  damage(w, p, 50, dummy, 'Test');
  assert.equal(p.health, SOLDIER.maxHealth);
});

test('Jet Overdrive keeps the jet tank full; Banana Juice heals; Rapid Fire uses no ammo', () => {
  const { w, p } = world();
  rewardBananaCrate(w, p, 'overdrive');
  p.fuel = 1;
  updateWorld(w, 1 / 60);
  assert.equal(p.fuel, PHYSICS.fuelMax);

  rewardBananaCrate(w, p, 'heal');
  assert.equal(p.health, SOLDIER.maxHealth);

  rewardBananaCrate(w, p, 'rapid');
  const gun = activeGun(p);
  const before = gun.ammo;
  p.controls.fire = true;
  p.controls.aimX = p.x + 300; p.controls.aimY = p.y + 25;
  for (let i = 0; i < 30; i++) updateWorld(w, 1 / 60);
  assert.equal(gun.ammo, before);
});

test('a power runs out after its time and announces it; random adds bonus seconds', () => {
  const { w, p, events } = world();
  const id = rewardBananaCrate(w, p, 'random');
  assert.equal(p.power.timer, POWERS[id].seconds + BANANA_CRATE.randomBonus);
  for (let t = 0; t < POWERS[id].seconds + BANANA_CRATE.randomBonus + 0.5; t += 1 / 60) updateWorld(w, 1 / 60);
  assert.equal(p.power, null);
  assert.ok(events.some((e) => e.name === 'power:warning'));
  assert.ok(events.some((e) => e.name === 'power:end' && e.payload.power === id));
});

test('the crate offers three different powers and comes back after its respawn time', () => {
  const choices = powerChoices();
  assert.equal(choices.length, 3);
  assert.equal(new Set(choices).size, 3);
  assert.ok(choices.every((c) => POWERS[c]));
  const crate = { kind: 'banana', active: true, timer: 0 };
  closeBananaCrate(crate);
  assert.equal(crate.timer, BANANA_CRATE.respawn);
});

test('every map has five banana crates on solid ground', () => {
  for (const id of Object.keys(MAPS)) {
    const m = createMap(id);
    assert.equal(m.bananaSpots.length, 5, id);
    for (const { x, y } of m.bananaSpots) {
      const c = Math.floor(x / 40); const r = Math.floor(y / 40);
      assert.equal(m.grid[r][c], 0, `${id} crate tile is empty`);
      assert.ok(m.grid[r + 1][c] > 0, `${id} crate stands on something`);
    }
  }
});

test('Rage does not double your own blast damage, and a power ends when you die', () => {
  const { w, p, events } = world();
  rewardBananaCrate(w, p, 'rage');
  damage(w, p, 20, p, 'Rocket');
  assert.equal(p.health, SOLDIER.maxHealth - 20);
  damage(w, p, 500, p, 'Rocket');
  assert.equal(p.alive, false);
  assert.equal(p.power, null);
  assert.ok(events.some((e) => e.name === 'power:end' && e.payload.power === 'rage'));
});
