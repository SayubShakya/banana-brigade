// Auto-fire tests (client/src/game/autoFire.js): the gun should fire by itself only
// when the aim is on an enemy that is in range and not behind a wall.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAimedAtEnemy } = require('../../client/src/game/autoFire.js');
const { TILE, WEAPONS } = require('../../client/src/game/config.js');

// An open 60 x 20 tile arena; `wallCol` adds a solid column of tiles.
function arena(wallCol = null) {
  const cols = 60, rows = 20;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, (_, c) => (c === wallCol ? 1 : 0)));
  return { cols, rows, grid };
}

// A soldier whose centre is at (cx, cy), like the game's 28 x 50 soldiers.
function soldier(id, team, cx, cy, extra = {}) {
  return {
    id, team, alive: true, w: 28, h: 50, x: cx - 14, y: cy - 25,
    current: 'sidearm', primary: null, sidearm: { key: 'magnum', ammo: 8, spare: Infinity },
    controls: { aimX: 0, aimY: 0 }, ...extra,
  };
}

// The player at (200, 400) aiming at the point (aimX, aimY).
function setup({ enemy, wallCol, aim, team = 'p1', playerExtra = {} }) {
  const player = soldier('p0', 'p0', 200, 400, playerExtra);
  player.controls.aimX = aim.x;
  player.controls.aimY = aim.y;
  const other = soldier('p1', team, enemy.x, enemy.y);
  return { player, world: { map: arena(wallCol), soldiers: [player, other] }, other };
}

test('fires when the aim is on an enemy in the open', () => {
  const { player, world } = setup({ enemy: { x: 600, y: 400 }, aim: { x: 600, y: 375 } });
  assert.equal(isAimedAtEnemy(player, world), true);
});

test('fires when the aim is just off the body (small slack)', () => {
  const { player, world } = setup({ enemy: { x: 600, y: 400 }, aim: { x: 600, y: 370 } });
  assert.equal(isAimedAtEnemy(player, world), true);
});

test('does not fire when aiming away from the enemy', () => {
  const { player, world } = setup({ enemy: { x: 600, y: 400 }, aim: { x: 600, y: 200 } });
  assert.equal(isAimedAtEnemy(player, world), false);
});

test('does not fire at an enemy behind the player', () => {
  const { player, world } = setup({ enemy: { x: 600, y: 400 }, aim: { x: 0, y: 375 } });
  assert.equal(isAimedAtEnemy(player, world), false);
});

test('does not fire through a wall', () => {
  const { player, world } = setup({ enemy: { x: 600, y: 400 }, aim: { x: 600, y: 375 }, wallCol: Math.floor(400 / TILE) });
  assert.equal(isAimedAtEnemy(player, world), false);
});

test('does not fire at a teammate', () => {
  const { player, world } = setup({ enemy: { x: 600, y: 400 }, aim: { x: 600, y: 375 }, team: 'p0' });
  assert.equal(isAimedAtEnemy(player, world), false);
});

test('does not fire at a dead enemy', () => {
  const { player, world, other } = setup({ enemy: { x: 600, y: 400 }, aim: { x: 600, y: 375 } });
  other.alive = false;
  assert.equal(isAimedAtEnemy(player, world), false);
});

test('respects the range of the weapon in hand', () => {
  // The shotgun reaches about 430 px; an enemy 1000 px away is out of range for it
  // but within the sniper's range.
  const far = { x: 1200, y: 400 };
  const shotgun = setup({ enemy: far, aim: { x: 1200, y: 375 }, playerExtra: { current: 'primary', primary: { key: 'shotgun', ammo: 6, spare: 18 } } });
  assert.ok(WEAPONS.shotgun.range < 1000);
  assert.equal(isAimedAtEnemy(shotgun.player, shotgun.world), false);
  const sniper = setup({ enemy: far, aim: { x: 1200, y: 375 }, playerExtra: { current: 'primary', primary: { key: 'sniper', ammo: 5, spare: 15 } } });
  assert.equal(isAimedAtEnemy(sniper.player, sniper.world), true);
});
