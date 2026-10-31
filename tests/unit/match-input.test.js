// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanLog, cleanRoster, LIMITS } = require('../../server/models/match');
const { parseMatchInput, soloWinner } = require('../../server/services/matchService');

test('cleanLog keeps known types, rounds t to 1 decimal, trims text and caps the length', () => {
  assert.deepEqual(cleanLog('nope'), []);
  assert.deepEqual(cleanLog([{ t: 3.14159, type: 'puzzle', by: ' a\u0007b ', ok: false, detail: 'crate', $where: 'x' }]), [{ t: 3.1, type: 'puzzle', by: 'ab', ok: false, detail: 'crate' }]);
  assert.deepEqual(cleanLog([{ t: Infinity, type: 'kill' }, { t: 1, type: 'boom' }, { t: '2', type: 'end' }]), []);
  assert.equal(cleanLog(Array.from({ length: 500 }, () => ({ t: 1, type: 'end' }))).length, LIMITS.log);
});

test('cleanRoster drops nameless rows, clamps numbers, checks the team and caps at 12', () => {
  assert.deepEqual(cleanRoster([{ name: 'kiwi', team: 'red', kills: 2.4, deaths: -1, bot: 1 }]), [{ name: 'kiwi', team: 'red', kills: 2, deaths: 0, bot: false }]);
  assert.deepEqual(cleanRoster([{ name: '   ' }, { name: 'x', team: 'pink' }]), [{ name: 'x', kills: 0, deaths: 0, bot: false }]);
  assert.equal(cleanRoster(Array.from({ length: 30 }, (_, i) => ({ name: `b${i}` }))).length, LIMITS.roster);
});

test('parseMatchInput refuses wrong types, never trusts a userId and only asks for a match when a roster or log is sent', () => {
  assert.throws(() => parseMatchInput({ log: {} }), /log must be a list/);
  assert.throws(() => parseMatchInput({ roster: 'x' }), /roster must be a list/);
  assert.throws(() => parseMatchInput({ map: [] }), /map must be text/);
  assert.equal(parseMatchInput({}).wanted, false);
  const input = parseMatchInput({ roster: [{ name: 'me', me: true, userId: '0123456789abcdef01234567' }], map: ' docks ' });
  assert.equal(input.wanted, true);
  assert.equal(input.map, 'docks');
  assert.deepEqual(input.roster, [{ name: 'me', kills: 0, deaths: 0, bot: false, me: true }]);
  assert.deepEqual(parseMatchInput({ roster: [{ name: 'a', me: true }, { name: 'b', me: true, bot: true }] }).roster.map((r) => !!r.me), [true, false]);
});

test('soloWinner: nobody wins survival, a failed mission or a battle ended with no kills; a quit team battle goes to the team ahead', () => {
  const me = { name: 'me', kills: 1, deaths: 0, me: true };
  const bots = [{ name: 'Rex', kills: 3, deaths: 1 }, { name: 'Kiwi', kills: 3, deaths: 2 }];
  assert.equal(soloWinner({ mode: 'survival', won: false }, [me, ...bots], false, false), null);
  assert.equal(soloWinner({ mode: 'campaign', won: false }, [me, ...bots], false, false), null);
  assert.equal(soloWinner({ mode: 'campaign', won: true }, [me, ...bots], false, false), 'me');
  assert.equal(soloWinner({ mode: 'quick', won: false }, [me, ...bots], false, false), 'Rex');
  assert.equal(soloWinner({ mode: 'quick', won: true }, [{ ...me, kills: 9 }, ...bots], false, false), 'me');
  assert.equal(soloWinner({ mode: 'quick', won: false }, [{ ...me, kills: 0 }, { name: 'Rex', kills: 0, deaths: 0 }], false, false), null);
  assert.equal(soloWinner({ mode: 'quick', won: false }, [me, ...bots], false, true), null);
  const team = [{ ...me, team: 'blue', kills: 4 }, { name: 'Rex', team: 'red', kills: 1 }, { name: 'Kiwi', team: 'blue', kills: 1 }];
  assert.equal(soloWinner({ mode: 'team', won: false }, team, true, false), 'blue');
  assert.equal(soloWinner({ mode: 'team', won: false }, team.map((r) => ({ ...r, kills: 1 })).slice(0, 2), true, false), null);
  assert.equal(soloWinner({ mode: 'team', won: true }, team, true, false), 'blue');
});
