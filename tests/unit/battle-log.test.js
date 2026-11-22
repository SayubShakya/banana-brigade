// Unit tests for the battle log (client/src/game/battleLog.js), which listens to game events
// and turns them into a timed list of entries plus a final scoreboard (roster).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBattleLog, LOG_CAP } = require('../../client/src/game/battleLog.js');
const { createWorld, damage, callSupplyDrop, fillBananaMeter, rewardBananaCrate, endMatchNow } = require('../../client/src/game/world.js');

// A tiny fake world with one player and one bot; it records which events still reach the game.
function fakeWorld() {
  const seen = [];
  const me = { id: 'p0', name: 'sayub', isPlayer: true, team: 'p0', kills: 0, deaths: 0 };
  const bot = { id: 'b0', name: 'Bot Kiwi', isPlayer: false, team: 'b0', kills: 0, deaths: 0 };
  const w = { time: 0, player: me, soldiers: [me, bot], emit: (name, p) => seen.push(name) };
  return { w, me, bot, seen };
}

// Proves each kind of game event becomes the right log entry with the match time,
// and that the log only listens: events still reach the rest of the game.
test('kills, puzzles, powers, drops and the end reason become log entries with match time', () => {
  const { w, me, bot, seen } = fakeWorld();
  const log = createBattleLog(w);
  w.time = 3.14;
  w.emit('soldier:killed', { victim: bot, killer: me, weapon: 'sniper' });
  log.puzzle('sayub', true, 'crate');
  w.time = 7;
  w.emit('power:start', { soldier: me, power: 'rage' });
  w.emit('banana:drop', { soldier: me });
  w.emit('pickup:taken', { soldier: bot, kind: 'weapon', weapon: 'smg', crate: true });
  w.emit('pickup:taken', { soldier: bot, kind: 'health' });
  w.emit('weapon:fired', { soldier: me });
  w.emit('match:ended', { reason: 'time' });
  assert.deepEqual(seen.slice(0, 2), ['soldier:killed', 'power:start'], 'events still reach the game');
  assert.deepEqual(log.entries(), [
    { t: 3.1, type: 'kill', by: 'sayub', target: 'Bot Kiwi', weapon: 'Sniper' },
    { t: 3.1, type: 'puzzle', by: 'sayub', ok: true, detail: 'crate' },
    { t: 7, type: 'power', by: 'sayub', detail: 'Banana Rage' },
    { t: 7, type: 'drop', by: 'sayub', detail: 'Supply drop' },
    { t: 7, type: 'crate', by: 'Bot Kiwi', detail: 'SMG' },
    { t: 7, type: 'end', detail: 'Time up' },
  ]);
});

// Proves the log is capped at 300 entries so it cannot grow forever, but the end entry is kept.
test('the log stops at 300 entries but always keeps the end entry', () => {
  const { w, me, bot } = fakeWorld();
  const log = createBattleLog(w);
  for (let i = 0; i < 400; i++) w.emit('soldier:killed', { victim: bot, killer: me, weapon: 'smg' });
  w.emit('match:ended', { reason: 'kill limit' });
  const list = log.entries();
  assert.equal(list.length, LOG_CAP);
  assert.deepEqual(list.at(-1), { t: 0, type: 'end', detail: 'Kill limit' });
  assert.equal(list.filter((e) => e.type === 'kill').length, LOG_CAP - 1);
});

// Proves long names are cut to 40 characters and the roster marks the player and the bots.
test('names are cut to 40 characters and the roster marks me and the bots', () => {
  const { w, me, bot } = fakeWorld();
  bot.name = 'B'.repeat(60);
  bot.kills = 4;
  me.deaths = 2;
  const log = createBattleLog(w);
  w.emit('soldier:respawned', { soldier: bot });
  assert.equal(log.entries()[0].by.length, 40);
  assert.deepEqual(log.roster(), [
    { name: 'B'.repeat(40), kills: 4, deaths: 0, bot: true },
    { name: 'sayub', kills: 0, deaths: 2, bot: false, me: true },
  ]);
});

// Proves the log works with a real world (not a fake): kill, drop, power and end are logged,
// and in team mode every roster row has a team.
test('a real quick battle logs kills, the supply drop and the end, and the roster has teams in team mode', () => {
  const w = createWorld({ mode: 'team', playerName: 'sayub', playerAvatar: {}, botAvatars: [{}], botNames: ['Kiwi', 'Mango', 'Plum', 'Fig', 'Lime', 'Date'], emit: () => {} });
  const log = createBattleLog(w);
  const enemy = w.soldiers.find((s) => s.team === 'red');
  enemy.shieldTimer = 0;
  w.time = 12.34;
  damage(w, enemy, 999, w.player, 'rifle');
  fillBananaMeter(w, w.player);
  callSupplyDrop(w, w.player);
  rewardBananaCrate(w, w.player, 'rage');
  endMatchNow(w, 'quit');
  const types = log.entries().map((e) => e.type);
  assert.deepEqual(types, ['kill', 'drop', 'power', 'end']);
  assert.deepEqual(log.entries()[0], { t: 12.3, type: 'kill', by: 'sayub', target: enemy.name, weapon: 'Assault Rifle' });
  const roster = log.roster();
  assert.equal(roster.length, w.soldiers.length);
  assert.ok(roster.every((r) => r.team === 'blue' || r.team === 'red'));
  assert.deepEqual(roster.filter((r) => r.me).map((r) => r.name), ['sayub']);
  assert.equal(roster[0].kills, 1);
});

// Proves survival mode logs each new wave.
test('survival logs each wave', () => {
  const w = createWorld({ mode: 'survival', playerName: 'sayub', playerAvatar: {}, botAvatars: [{}], botNames: ['Kiwi'], emit: () => {} });
  const log = createBattleLog(w);
  for (const s of w.soldiers.filter((x) => !x.isPlayer)) s.gone = true;
  w.soldiers = [w.player];
  w.wave += 1;
  w.emit('survival:wave', { wave: w.wave, count: 3 });
  assert.deepEqual(log.entries(), [{ t: 0, type: 'wave', detail: 'Wave 2' }]);
});

// Proves the opening entries (deploy puzzles and wave 1) are added even though they
// happen before the log is created.
test('the opening logs the deploy puzzles and the first survival wave, which starts before the log exists', () => {
  const w = createWorld({ mode: 'survival', playerName: 'sayub', playerAvatar: {}, botAvatars: [{}], botNames: ['Kiwi'], emit: () => {} });
  assert.equal(w.wave, 1);
  const log = createBattleLog(w);
  log.opening('sayub', { attempts: 2, solved: 1 });
  assert.deepEqual(log.entries(), [
    { t: 0, type: 'puzzle', by: 'sayub', ok: false, detail: 'deploy' },
    { t: 0, type: 'puzzle', by: 'sayub', ok: true, detail: 'deploy' },
    { t: 0, type: 'wave', detail: 'Wave 1' },
  ]);
  const quick = createBattleLog(createWorld({ mode: 'quick', playerName: 'sayub', playerAvatar: {}, botAvatars: [{}], botNames: ['Kiwi'], emit: () => {} }));
  quick.opening('sayub', { attempts: 1, solved: 1 });
  assert.deepEqual(quick.entries().map((e) => e.type), ['puzzle']);
});

// Proves bots that join with a new wave are not wrongly logged as respawns.
test('soldiers that first appear with a new survival wave are not logged as respawns', () => {
  const { w, bot } = fakeWorld();
  const log = createBattleLog(w);
  const fresh = { id: 'b9', name: 'Wave Bot', isPlayer: false, kills: 0, deaths: 0 };
  w.soldiers.push(fresh);
  w.emit('soldier:respawned', { soldier: fresh });
  w.emit('soldier:respawned', { soldier: bot });
  w.emit('soldier:respawned', { soldier: fresh });
  assert.deepEqual(log.entries().map((e) => e.by), ['Bot Kiwi', 'Wave Bot']);
});

// Proves dead survival bots that were removed from the world still show on the final scoreboard.
test('survival bots that were killed and removed still appear on the final scoreboard', () => {
  const { w, me, bot } = fakeWorld();
  const log = createBattleLog(w);
  const wave2 = { id: 'b1', name: 'Bot Mango', isPlayer: false, team: 'b1', kills: 1, deaths: 0 };
  w.soldiers.push(wave2);
  w.emit('soldier:respawned', { soldier: wave2 });
  me.kills = 2;
  bot.deaths = 1;
  wave2.deaths = 1;
  w.emit('soldier:killed', { victim: bot, killer: me, weapon: 'smg' });
  w.emit('soldier:killed', { victim: wave2, killer: me, weapon: 'smg' });
  w.soldiers = [me];
  assert.deepEqual(log.roster().map((r) => r.name), ['sayub', 'Bot Mango', 'Bot Kiwi']);
});
