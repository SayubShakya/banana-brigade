// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../../client/src/services/history.js');

test('history: clock formats seconds as m:ss and copes with bad input', () => {
  assert.equal(h.clock(0), '0:00');
  assert.equal(h.clock(7.9), '0:07');
  assert.equal(h.clock(65), '1:05');
  assert.equal(h.clock(600), '10:00');
  assert.equal(h.clock(undefined), '0:00');
  assert.equal(h.clock(-3), '0:00');
});

test('history: result label is Won, Lost, Draw or Wave N', () => {
  assert.deepEqual(h.resultLabel({ mode: 'quick', won: true }), { text: 'Won', kind: 'won' });
  assert.deepEqual(h.resultLabel({ mode: 'team', won: false }), { text: 'Lost', kind: 'lost' });
  assert.deepEqual(h.resultLabel({ mode: 'online', won: false, draw: true }), { text: 'Draw', kind: 'draw' });
  assert.deepEqual(h.resultLabel({ mode: 'survival', wave: 7, won: false }), { text: 'Wave 7', kind: 'wave' });
});

test('history: log entries become readable sentences', () => {
  assert.equal(h.sentence({ type: 'kill', by: 'sayub', target: 'Bot Kiwi', weapon: 'sniper' }), 'sayub ✶ Bot Kiwi with Sniper');
  assert.equal(h.sentence({ type: 'kill', by: 'sayub', target: 'sayub', weapon: 'rocket' }), 'sayub was taken out by their own Rocket Launcher');
  assert.equal(h.sentence({ type: 'puzzle', by: 'sayub', ok: true, detail: 'respawn' }), 'sayub solved a banana puzzle to respawn');
  assert.equal(h.sentence({ type: 'puzzle', by: 'sayub', ok: false, detail: 'crate' }), 'sayub missed a banana puzzle for a crate');
  assert.equal(h.sentence({ type: 'crate', by: 'sayub', detail: 'shotgun' }), 'sayub opened a banana crate: Shotgun');
  assert.equal(h.sentence({ type: 'power', by: 'sayub', detail: 'Double damage' }), 'sayub picked a power: Double damage');
  assert.equal(h.sentence({ type: 'wave', detail: 'Wave 3' }), 'Wave 3 started');
  assert.equal(h.sentence({ type: 'join', by: 'kiwi' }), 'kiwi joined the battle');
  assert.equal(h.sentence({ type: 'end', detail: 'Kill limit' }), 'Battle over: Kill limit');
  assert.equal(h.sentence({ type: 'respawn' }), 'Someone respawned');
  for (const type of Object.keys(h.ICONS)) assert.equal(typeof h.sentence({ type, by: 'x' }), 'string');
});

test('history: winner label handles teams, players and survival', () => {
  assert.equal(h.winnerLabel({ teamMode: true, winner: 'blue' }), 'Blue team won');
  assert.equal(h.winnerLabel({ winner: 'sayub' }), 'sayub won');
  assert.equal(h.winnerLabel({ mode: 'survival', winner: null }), 'Survival run');
  assert.equal(h.winnerLabel({ mode: 'online', winner: null }), 'No winner');
});

test('history: roster is ranked by kills then fewest deaths', () => {
  const r = h.rankRoster([{ name: 'a', kills: 2, deaths: 3 }, { name: 'b', kills: 5, deaths: 1 }, { name: 'c', kills: 2, deaths: 0 }]);
  assert.deepEqual(r.map((x) => [x.name, x.rank]), [['b', 1], ['c', 2], ['a', 3]]);
  assert.deepEqual(h.rankRoster(), []);
});

test('leaderboard: own rank is pinned only when not already visible', () => {
  const rows = [{ username: 'kiwi', rank: 1 }, { username: 'mango', rank: 2 }];
  assert.equal(h.pinnedMe({ rows, me: null }, 'sayub'), null);
  assert.equal(h.pinnedMe({ rows: [...rows, { username: 'sayub', rank: 3 }], me: { username: 'sayub', rank: 3 } }, 'sayub'), null);
  assert.deepEqual(h.pinnedMe({ rows, me: { rank: 42, kills: 3 } }, 'sayub'), { rank: 42, kills: 3, username: 'sayub' });
  assert.equal(h.boardStat({ wave: 9, kills: 4 }, 'survival', 'best'), 9);
  assert.equal(h.boardStat({ wave: 9, kills: 4 }, 'survival', 'career'), 4);
});

test('history: filters cover every saved mode and labels are friendly', () => {
  assert.deepEqual(h.FILTERS.map(([k]) => k), ['all', 'solo', 'online', 'quick', 'survival', 'team', 'campaign']);
  assert.equal(h.modeName('team'), 'Team Battle');
  assert.equal(h.mapLabel('jungle'), 'Jungle Ridge');
  assert.equal(h.mapLabel(null), '—');
  assert.equal(h.ago(new Date(Date.now() - 5 * 60000).toISOString()), '5 min ago');
});
