// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatch } = require('../../server/realtime/match.js');
const { damage, revive } = require('../../client/src/game/world.js');
const { updateBots } = require('../../client/src/game/bots.js');
const { SOLDIER, DIFFICULTY } = require('../../client/src/game/config.js');

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'] });
  const sent = [];
  const match = createMatch({
    players: [{ userId: '1', username: 'sayub', parts: {}, team: 'blue' }],
    teamMode: false, difficulty: 'hard', onEnd: () => {},
    send: (event, payload, userId) => sent.push({ event, payload, userId }),
  });
  t.after(() => { match.stop(); t.mock.timers.reset(); });
  const world = match.world;
  const me = world.soldiers.find((s) => s.id === 'u1');
  const enemy = world.soldiers.find((s) => s !== me);
  const crate = world.pickups.find((p) => p.kind === 'banana');
  const pressE = () => world.emit('banana:crate', { soldier: me, pickup: crate });
  const offers = () => sent.filter((m) => m.event === 'puzzle:offer');
  return { match, world, me, enemy, crate, sent, pressE, offers, tick: (ms) => t.mock.timers.tick(ms) };
}

test('opening a crate sends the room difficulty time; the solver is frozen and cannot be hurt', (t) => {
  const { match, me, enemy, sent, pressE, tick } = setup(t);
  pressE();
  assert.deepEqual(sent.at(-1), { event: 'puzzle:offer', payload: { purpose: 'crate', seconds: DIFFICULTY.hard.puzzle.crate }, userId: '1' });
  assert.equal(me.busy, true);
  const health = me.health;
  damage(match.world, me, 80, enemy, 'Test');
  assert.equal(me.health, health);
  match.setControls('1', { left: true, jet: true, fire: true, aimX: 10, aimY: 20 });
  tick(100);
  assert.equal(me.controls.left, false);
  assert.equal(me.controls.fire, false);
});

test('bots do not pick a player who is solving a crate puzzle', (t) => {
  const { world, me, pressE } = setup(t);
  me.shieldTimer = 0;
  pressE();
  me.shieldTimer = 0;
  updateBots(world, 1 / 30);
  assert.ok(world.soldiers.every((s) => s.brain?.target?.soldier !== me));
});

test('a wrong answer keeps the protection while the answer is shown, then a 2 s exit shield', (t) => {
  const { match, me, crate, pressE, tick } = setup(t);
  pressE();
  match.applyPuzzle('1', 'crate', false);
  assert.equal(crate.active, false, 'a missed crate is used up');
  tick(1500);
  assert.equal(me.busy, true, 'still frozen and shielded while the window shows the answer');
  assert.ok(me.shieldTimer > 100);
  tick(150);
  assert.equal(me.busy, false);
  assert.ok(me.shieldTimer > SOLDIER.spawnShield - 0.2 && me.shieldTimer <= SOLDIER.spawnShield);
  assert.ok(me.graceUntil > match.world.time + SOLDIER.spawnShield, 'bots wait a little longer');
});

test('"Leave it" gives the exit shield and leaves the crate for someone else', (t) => {
  const { match, me, crate, pressE } = setup(t);
  pressE();
  match.cancelCrate('1');
  assert.equal(me.busy, false);
  assert.equal(me.shieldTimer, SOLDIER.spawnShield);
  assert.equal(crate.active, true);
  assert.equal(match.canAsk('1', 'crate'), false);
});

test('a right answer offers powers; choosing one ends the freeze with the exit shield', (t) => {
  const { match, me, sent, pressE } = setup(t);
  pressE();
  match.applyPuzzle('1', 'crate', true);
  const offer = sent.find((m) => m.event === 'power:offer');
  assert.ok(offer);
  assert.equal(me.busy, true);
  const power = match.choosePower('1', offer.payload.choices[0]);
  assert.equal(power, offer.payload.choices[0]);
  assert.equal(me.busy, false);
  assert.equal(me.shieldTimer, SOLDIER.spawnShield);
});

test('the server closes a crate puzzle nobody answers', (t) => {
  const { match, me, crate, sent, pressE, tick } = setup(t);
  pressE();
  tick(DIFFICULTY.hard.puzzle.crate * 1000 + 5000);
  assert.equal(me.busy, true, 'not before the countdown plus the spare time');
  tick(1100);
  assert.equal(me.busy, false);
  assert.ok(sent.some((m) => m.event === 'puzzle:closed' && m.userId === '1'));
  assert.equal(crate.active, true);
  match.applyPuzzle('1', 'crate', true);
  assert.equal(sent.some((m) => m.event === 'power:offer'), false);
});

test('the same player must wait 5 s before opening a crate again', (t) => {
  const { match, pressE, offers, tick } = setup(t);
  pressE();
  match.cancelCrate('1');
  pressE();
  assert.equal(offers().length, 1);
  tick(4900);
  pressE();
  assert.equal(offers().length, 1);
  tick(200);
  pressE();
  assert.equal(offers().length, 2);
});

test('stop() clears the crate timers', (t) => {
  const { match, sent, pressE, tick } = setup(t);
  pressE();
  match.stop();
  tick(60000);
  assert.equal(sent.some((m) => m.event === 'puzzle:closed'), false);
});

test('the online respawn puzzle is one try per death', (t) => {
  const { match, me } = setup(t);
  me.alive = false;
  me.respawnTimer = 99;
  assert.equal(match.canAsk('1', 'respawn'), true);
  match.puzzleIssued('1', 'respawn');
  match.applyPuzzle('1', 'respawn', false);
  assert.equal(me.alive, false);
  assert.equal(match.canAsk('1', 'respawn'), false, 'no second try after a miss or a closed window');
  revive(match.world, me);
  me.alive = false;
  assert.equal(match.canAsk('1', 'respawn'), true, 'a new death gives a new try');
});

test('two players cannot open the same crate at once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'setImmediate', 'Date'] });
  const sent = [];
  const match = createMatch({
    players: [{ userId: '1', username: 'sayub', parts: {}, team: 'blue' }, { userId: '2', username: 'friend', parts: {}, team: 'red' }],
    teamMode: false, difficulty: 'medium', onEnd: () => {},
    send: (event, payload, userId) => sent.push({ event, payload, userId }),
  });
  t.after(() => { match.stop(); t.mock.timers.reset(); });
  const [a, b] = ['u1', 'u2'].map((id) => match.world.soldiers.find((s) => s.id === id));
  const crate = match.world.pickups.find((p) => p.kind === 'banana');
  match.world.emit('banana:crate', { soldier: a, pickup: crate });
  match.world.emit('banana:crate', { soldier: b, pickup: crate });
  const offers = sent.filter((m) => m.event === 'puzzle:offer');
  assert.deepEqual(offers.map((m) => m.userId), ['1']);
  assert.ok(!b.busy);
});
