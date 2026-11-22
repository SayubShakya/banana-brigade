// Unit tests for the minimap (client/src/game/minimap.js): it only shows enemies the player
// could really see, so it cannot be used to spot people hiding behind walls.
const test = require('node:test');
const assert = require('node:assert/strict');
const { enemyVisible, isHostile, minimapRect, FIRE_MEMORY, MINIMAP } = require('../../client/src/game/minimap.js');

// Builds a small empty map; wallCol puts a solid wall in one column.
function arena(wallCol = null) {
  const cols = 60, rows = 20;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, (_, c) => (c === wallCol ? 1 : 0)));
  return { cols, rows, grid };
}

// Makes a soldier object centred on (cx, cy).
const soldier = (id, team, cx, cy, extra = {}) => ({ id, team, alive: true, w: 28, h: 50, x: cx - 14, y: cy - 25, ...extra });

// Proves an enemy in plain sight is shown on the minimap.
test('an enemy in the open is shown', () => {
  const me = soldier('p0', 'p0', 200, 400);
  const enemy = soldier('b1', 'b1', 900, 400);
  assert.equal(enemyVisible(arena(), me, enemy, 10, undefined), true);
});

// Proves an enemy behind a wall is hidden.
test('an enemy behind a wall is hidden', () => {
  const me = soldier('p0', 'p0', 200, 400);
  const enemy = soldier('b1', 'b1', 900, 400);
  assert.equal(enemyVisible(arena(15), me, enemy, 10, undefined), false);
});

// Proves a hidden enemy shows for two seconds after firing, then disappears again.
test('an enemy behind a wall shows for two seconds after firing', () => {
  const me = soldier('p0', 'p0', 200, 400);
  const enemy = soldier('b1', 'b1', 900, 400);
  assert.equal(enemyVisible(arena(15), me, enemy, 10, 10 - FIRE_MEMORY + 0.1), true);
  assert.equal(enemyVisible(arena(15), me, enemy, 10, 10 - FIRE_MEMORY - 0.1), false);
});

// Proves dead enemies are never shown.
test('dead enemies are never shown', () => {
  const me = soldier('p0', 'p0', 200, 400);
  const enemy = soldier('b1', 'b1', 900, 400, { alive: false });
  assert.equal(enemyVisible(arena(), me, enemy, 10, 10), false);
});

// Proves teammates are not shown as enemies, but other teams and free-for-all bots are.
test('teammates are not enemies, other teams and free-for-all bots are', () => {
  const me = soldier('p0', 'blue', 0, 0);
  assert.equal(isHostile(me, soldier('b1', 'blue', 0, 0)), false);
  assert.equal(isHostile(me, soldier('b2', 'red', 0, 0)), true);
  assert.equal(isHostile(me, me), false);
  const solo = soldier('p0', 'p0', 0, 0);
  assert.equal(isHostile(solo, soldier('b3', 'b3', 0, 0)), true);
});

// Proves the minimap panel sits just below the player bars and keeps its size.
test('the panel sits below the player bars and keeps its size', () => {
  const r = minimapRect(150);
  assert.equal(r.y, 150 + MINIMAP.gap);
  assert.equal(r.w, MINIMAP.width);
  assert.equal(r.h, MINIMAP.height);
});
