// Gameplay tests that run the real game engine (client/src/game/world.js and bots.js)
// in Node, with no browser: sniper headshots, the Shield / Jet Fuel / Ammo power-ups,
// a whole 120-second bot match, and easy bots being weaker than hard ones.
// Math.random is swapped for a seeded generator so every run plays the same match.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, updateWorld, damage, activeGun } = require('../client/src/game/world.js');
const { updateBots } = require('../client/src/game/bots.js');
const { WEAPONS, PICKUPS, PHYSICS, SOLDIER } = require('../client/src/game/config.js');

const STEP = 1 / 60;

// Runs fn with Math.random replaced by a small seeded generator (mulberry32).
function seeded(seed, fn) {
  const real = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = real; }
}

function makeWorld(opts = {}) {
  const events = [];
  const world = createWorld({
    mode: 'quick', playerName: 'Tester', playerAvatar: {}, difficulty: 'medium',
    botAvatars: [{ bot: 0 }, { bot: 1 }], botNames: ['Rex', 'Viper', 'Ghost', 'Blaze', 'Tank'],
    emit: (name, payload) => events.push({ name, payload }), ...opts,
  });
  return { world, events };
}

// Only the player and one bot, both standing still in open air, unshielded.
function duel() {
  const { world, events } = makeWorld();
  const [shooter, victim] = world.soldiers;
  for (const s of world.soldiers.slice(2)) { s.alive = false; s.respawnTimer = Infinity; }
  for (const s of [shooter, victim]) s.shieldTimer = 0;
  const spot = world.map.spawns[0];
  Object.assign(victim, { x: spot.x, y: spot.y - 200, vx: 0, vy: 0 });
  return { world, events, shooter, victim };
}

function fireSniperAt(world, shooter, victim, hitY) {
  const w = WEAPONS.sniper;
  world.bullets.push({ owner: shooter, x: victim.x - 30, y: hitY, vx: w.speed, vy: 0, damage: w.damage, travelled: 0, range: w.range, color: w.color, weapon: w.name, headshot: w.headshot });
  updateWorld(world, STEP);
}

test('gameplay: a sniper headshot does 1.6x damage, kills in one shot and is flagged', () => {
  const { world, events, shooter, victim } = duel();
  fireSniperAt(world, shooter, victim, victim.y + victim.h * 0.8);   // body shot
  const body = events.find((e) => e.name === 'soldier:damaged');
  assert.equal(body.payload.amount, WEAPONS.sniper.damage);
  assert.equal(body.payload.headshot, false);
  assert.ok(victim.alive, 'a body shot is not a one-shot kill');

  victim.health = SOLDIER.maxHealth;
  events.length = 0;
  fireSniperAt(world, shooter, victim, victim.y + victim.h * 0.1);   // top 30% of the box
  const head = events.find((e) => e.name === 'soldier:damaged');
  assert.equal(head.payload.amount, WEAPONS.sniper.damage * 1.6);
  assert.equal(head.payload.headshot, true);
  assert.equal(victim.alive, false);
  assert.equal(events.find((e) => e.name === 'soldier:killed').payload.headshot, true);
});

test('gameplay: shotgun pellets do less damage far away', () => {
  const { world, shooter, victim } = duel();
  const w = WEAPONS.shotgun;
  const hits = [];
  world.emit = (name, p) => { if (name === 'soldier:damaged') hits.push(p.amount); };
  for (const travelled of [0, 380]) {
    victim.health = SOLDIER.maxHealth;
    world.bullets.push({ owner: shooter, x: victim.x - 10, y: victim.y + 30, vx: w.speed, vy: 0, damage: w.damage, travelled, range: w.range, color: w.color, weapon: w.name, falloff: w.falloff });
    updateWorld(world, STEP);
  }
  assert.equal(hits[0], w.damage);
  assert.ok(hits[1] < w.damage * 0.5, `far pellet did ${hits[1]}`);
});

// Puts a power-up on the soldier and lets the world run one step so it is picked up.
function grab(world, events, s, kind) {
  world.pickups.push({ kind, x: s.x + s.w / 2, y: s.y + s.h / 2, active: true, timer: 0 });
  updateWorld(world, STEP);
  return events.find((e) => e.name === 'pickup:taken' && e.payload.kind === kind && e.payload.soldier === s);
}

test('gameplay: the Shield absorbs 50 damage before health, then wears off', () => {
  const { world, events, victim } = duel();
  assert.ok(grab(world, events, victim, 'shield'), 'pickup:taken with kind shield');
  assert.equal(victim.armor, PICKUPS.shieldAmount);
  damage(world, victim, 30, null, 'Test');
  assert.equal(victim.health, SOLDIER.maxHealth);
  assert.equal(victim.armor, 20);
  damage(world, victim, 40, null, 'Test');
  assert.equal(victim.armor, 0);
  assert.equal(victim.health, SOLDIER.maxHealth - 20);

  grab(world, events, victim, 'shield');
  for (let t = 0; t < PICKUPS.shieldTime + 0.5; t += STEP) updateWorld(world, STEP);
  assert.equal(victim.armor, 0, 'an unused shield fades after its time');
});

test('gameplay: Jet Fuel refills the tank and gives unlimited fuel for a while', () => {
  const { world, events, shooter } = duel();
  shooter.fuel = 5;
  assert.ok(grab(world, events, shooter, 'fuel'));
  assert.equal(shooter.fuel, PHYSICS.fuelMax);
  shooter.controls.jet = true;
  for (let t = 0; t < PICKUPS.fuelBoostTime - 1; t += STEP) updateWorld(world, STEP);
  assert.equal(shooter.fuel, PHYSICS.fuelMax, 'no fuel burnt during the boost');
  for (let t = 0; t < 2; t += STEP) updateWorld(world, STEP);
  assert.ok(shooter.fuel < PHYSICS.fuelMax, 'fuel burns again after the boost');
});

test('gameplay: the Ammo box refills spare ammo', () => {
  const { world, events, shooter } = duel();
  shooter.primary = { key: 'rifle', ammo: 3, spare: 0 };
  assert.ok(grab(world, events, shooter, 'ammo'));
  assert.equal(shooter.primary.spare, WEAPONS.rifle.mag * WEAPONS.rifle.spareMags);
  assert.equal(activeGun(shooter).key, 'rifle');
});

// Plays a bot match for `seconds`, tracking how long each bot stays in one place.
function simulate({ seconds, difficulty, seed }) {
  return seeded(seed, () => {
    const { world, events } = makeWorld({ difficulty });
    const still = new Map();   // bot -> { x, y, time }
    let longestStill = 0;
    for (let t = 0; t < seconds && !world.over; t += STEP) {
      updateBots(world, STEP);
      updateWorld(world, STEP);
      for (const s of world.soldiers) {
        if (s.isPlayer) continue;
        const rec = still.get(s);
        if (!s.alive || !rec || Math.hypot(s.x - rec.x, s.y - rec.y) > 40) { still.set(s, { x: s.x, y: s.y, time: 0 }); continue; }
        rec.time += STEP;
        longestStill = Math.max(longestStill, rec.time);
      }
    }
    const botDamage = events
      .filter((e) => e.name === 'soldier:damaged' && e.payload.attacker && !e.payload.attacker.isPlayer)
      .reduce((sum, e) => sum + e.payload.amount, 0);
    const kills = events.filter((e) => e.name === 'soldier:killed').length;
    return { world, kills, botDamage, longestStill };
  });
}

test('gameplay: a 120 s quick match has kills and no bot stays stuck', () => {
  const { kills, longestStill } = simulate({ seconds: 120, difficulty: 'medium', seed: 7 });
  assert.ok(kills > 0, 'somebody got a kill');
  assert.ok(longestStill < 20, `a bot stood still for ${longestStill.toFixed(1)} s`);
});

test('gameplay: easy bots deal less damage than hard bots', () => {
  let easy = 0, hard = 0;
  for (const seed of [1, 2]) {
    easy += simulate({ seconds: 60, difficulty: 'easy', seed }).botDamage;
    hard += simulate({ seconds: 60, difficulty: 'hard', seed }).botDamage;
  }
  assert.ok(easy < hard, `easy ${easy} vs hard ${hard}`);
});
