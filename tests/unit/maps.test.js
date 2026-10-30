// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMap, MAP_IDS, MAPS, randomMapId } = require('../../client/src/game/map.js');
const { createWorld, updateWorld } = require('../../client/src/game/world.js');
const { MISSIONS } = require('../../client/src/game/campaign.js');
const { TILE } = require('../../client/src/game/config.js');

const toTile = (p) => [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];

function reachableFrom(map, [c0, r0]) {
  const fits = (c, r) => c > 0 && r > 1 && c < map.cols && r < map.rows && map.grid[r][c] === 0 && map.grid[r - 1][c] === 0;
  const seen = new Set();
  const queue = [[c0, r0]];
  while (queue.length) {
    const [c, r] = queue.pop();
    const key = `${c},${r}`;
    if (seen.has(key) || !fits(c, r)) continue;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return { seen, fits };
}

test('maps: there are at least four, each with a name and a theme', () => {
  assert.ok(MAP_IDS.length >= 4);
  for (const id of ['jungle', 'desert', 'snow', 'night']) {
    const map = createMap(id);
    assert.equal(map.id, id);
    assert.ok(map.name && map.theme && map.theme.sky.length === 3, `${id} has a name and sky`);
  }
  assert.equal(createMap('nowhere').id, 'jungle');
  assert.ok(MAP_IDS.includes(randomMapId()));
});

for (const id of Object.keys(MAPS)) {
  test(`maps: ${id} is a valid, enclosed grid`, () => {
    const map = createMap(id);
    assert.equal(map.grid.length, map.rows);
    map.grid.forEach((row) => assert.equal(row.length, map.cols));
    assert.equal(map.width, map.cols * TILE);
    for (let c = 0; c < map.cols; c++) {
      assert.equal(map.grid[0][c], 1, 'ceiling');
      assert.equal(map.grid[map.rows - 1][c], 1, 'floor');
    }
    for (let r = 0; r < map.rows; r++) assert.ok(map.grid[r][0] === 1 && map.grid[r][map.cols - 1] === 1, 'side walls');
  });

  test(`maps: ${id} spawns and pickups stand on empty tiles above solid ground`, () => {
    const map = createMap(id);
    assert.ok(map.spawns.length >= 8, 'enough spawns');
    const spots = { spawn: map.spawns, health: map.healthSpots, weapon: map.crateSpots, banana: map.bananaSpots };
    for (const [kind, list] of Object.entries(spots)) {
      assert.ok(list.length > 0, `${kind} spots`);
      for (const p of list) {
        const [c, r] = toTile(p);
        assert.equal(map.grid[r][c], 0, `${id} ${kind} at ${c},${r} is empty`);
        assert.equal(map.grid[r - 1][c], 0, `${id} ${kind} at ${c},${r} has head room`);
        assert.equal(map.grid[r + 1][c], 1, `${id} ${kind} at ${c},${r} stands on something`);
      }
    }
  });

  test(`maps: ${id} has no sealed pockets; every spawn and pickup is reachable`, () => {
    const map = createMap(id);
    const { seen, fits } = reachableFrom(map, toTile(map.spawns[0]));
    const all = [...map.spawns, ...map.healthSpots, ...map.crateSpots, ...map.bananaSpots];
    for (const p of all) assert.ok(seen.has(toTile(p).join(',')), `${id}: ${toTile(p)} is reachable from the first spawn`);
    for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
      if (fits(c, r)) assert.ok(seen.has(`${c},${r}`), `${id}: sealed pocket at ${c},${r}`);
    }
  });

  test(`maps: createWorld builds and runs a battle on ${id}`, () => {
    for (const mode of ['quick', 'team', 'survival', 'training']) {
      const world = createWorld({
        mode, map: id, playerName: 'Tester', playerAvatar: {}, emit: () => {},
        botAvatars: [{}, {}, {}], botNames: ['A', 'B', 'C'],
      });
      assert.equal(world.map.id, id);
      for (let i = 0; i < 120; i++) updateWorld(world, 1 / 60);
      for (const s of world.soldiers.filter((x) => x.alive)) {
        assert.ok(s.y < world.map.height && s.x > 0 && s.x < world.map.width, `${mode}: ${s.name} stays inside the map`);
      }
    }
  });
}

test('maps: quick battles pick a map at random, campaign missions have a fixed one', () => {
  const opts = { mode: 'quick', playerName: 'Tester', playerAvatar: {}, emit: () => {}, botAvatars: [{}], botNames: ['A'] };
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(createWorld(opts).map.id);
  assert.ok(seen.size > 1, 'more than one map turns up');
  for (const mission of MISSIONS) {
    assert.ok(MAP_IDS.includes(mission.map), `mission ${mission.id} names a map`);
    const world = createWorld({ ...opts, mode: 'campaign', mission });
    assert.equal(world.map.id, mission.map);
  }
});
