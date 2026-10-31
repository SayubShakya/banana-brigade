// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld, updateWorld } = require('../../client/src/game/world.js');
const { MODES, MATCH_LENGTHS, matchRules } = require('../../client/src/game/config.js');

const STEP = 1 / 60;

function makeWorld(opts = {}) {
  const events = [];
  const world = createWorld({
    mode: 'quick', playerName: 'Tester', playerAvatar: {}, difficulty: 'medium',
    botAvatars: [{ bot: 0 }, { bot: 1 }], botNames: ['Rex', 'Viper', 'Ghost', 'Blaze', 'Tank'],
    emit: (name, payload) => events.push({ name, payload }), ...opts,
  });
  return { world, events };
}

test('match length: each length sets the time and a kill target that grows with it', () => {
  assert.deepEqual(MATCH_LENGTHS.map((l) => l.seconds), [30, 60, 120, 180, 300]);
  assert.deepEqual(MATCH_LENGTHS.map((l) => l.kills.quick), [4, 6, 10, 15, 20]);
  assert.deepEqual(MATCH_LENGTHS.map((l) => l.kills.team), [6, 9, 15, 22, 30]);
  assert.deepEqual(MATCH_LENGTHS.map((l) => l.kills.online), [4, 6, 10, 15, 20]);
  assert.deepEqual(matchRules('quick', 30), { timeLimit: 30, killLimit: 4, label: '30 s' });
  assert.equal(matchRules('team', 120).killLimit, 15);
  assert.equal(matchRules('quick').timeLimit, 300, 'five minutes is the default');
  assert.equal(matchRules('quick', 45), null, 'only the listed lengths are allowed');
  assert.equal(matchRules('quick', '30'), null);
  assert.equal(matchRules('survival', 30), null, 'survival has no time limit');
  assert.equal(matchRules('campaign', 30), null);
});

test('match length: the world uses the chosen time and kill limit', () => {
  const rules = matchRules('quick', 60);
  const { world } = makeWorld(rules);
  assert.equal(world.timeLeft, 60);
  assert.equal(world.cfg.killLimit, 6);
  const team = makeWorld({ mode: 'team', ...matchRules('team', 180) }).world;
  assert.equal(team.timeLeft, 180);
  assert.equal(team.cfg.killLimit, 22);
  const plain = makeWorld().world;
  assert.equal(plain.timeLeft, MODES.quick.timeLimit);
  assert.equal(plain.cfg.killLimit, MODES.quick.killLimit);
});

test('match length: every world gets its own settings, so one match cannot change the next', () => {
  const a = makeWorld(matchRules('quick', 30)).world;
  const b = makeWorld().world;
  assert.notEqual(a.cfg, MODES.quick);
  assert.notEqual(a.cfg, b.cfg);
  a.cfg.killLimit = 1;
  assert.equal(MODES.quick.killLimit, 20);
  assert.equal(b.cfg.killLimit, 20);
});

test('match length: the kill target ends the match early', () => {
  const { world, events } = makeWorld(matchRules('quick', 30));
  const [player, bot] = world.soldiers;
  player.kills = 3;
  bot.shieldTimer = 0;
  bot.health = 1;
  world.bullets.push({ owner: player, x: bot.x - 10, y: bot.y + bot.h / 2, vx: 2000, vy: 0, damage: 50, travelled: 0, range: 2000, color: '#fff', weapon: 'Test', falloff: 0 });
  updateWorld(world, STEP);
  assert.equal(player.kills, 4);
  assert.equal(events.find((e) => e.name === 'match:ended')?.payload.reason, 'kill limit');
});

test('match length: a 30 s match ends by time and counts down the last 10 seconds', () => {
  const { world, events } = makeWorld(matchRules('quick', 30));
  for (const s of world.soldiers) { s.alive = false; s.respawnTimer = Infinity; }
  for (let i = 0; i < 31 * 60 && !world.over; i++) updateWorld(world, STEP);
  assert.ok(world.over);
  assert.ok(world.time >= 29.9 && world.time <= 30.1, `ended at ${world.time}`);
  assert.equal(events.find((e) => e.name === 'match:ended').payload.reason, 'time');
  const countdown = events.filter((e) => e.name === 'match:countdown').map((e) => e.payload.seconds);
  assert.deepEqual(countdown, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  for (let i = 0; i < 90; i++) updateWorld(world, STEP);
  assert.ok(Math.abs(world.endedAt - 30) < 0.1, 'the battle time stops at the final whistle');
});

test('an online match uses the chosen map, or a random one', () => {
  const { createMatch } = require('../../server/realtime/match.js');
  const opts = { players: [{ userId: '1', username: 'a', parts: {}, team: 'blue' }], teamMode: false, send: () => {}, onEnd: () => {} };
  const snow = createMatch({ ...opts, map: 'snow' });
  assert.equal(snow.world.map.id, 'snow');
  snow.stop();
  const any = createMatch({ ...opts, map: 'nowhere' });
  assert.ok(['jungle', 'desert', 'snow', 'night'].includes(any.world.map.id));
  any.stop();
});
