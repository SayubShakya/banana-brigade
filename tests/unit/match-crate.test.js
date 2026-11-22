// Unit tests for banana crates in online matches (server/realtime/match.js): the server
// controls the puzzle, the freeze while solving, shields, timeouts and the cooldown.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatch } = require('../../server/realtime/match.js');
const { damage, revive } = require('../../client/src/game/world.js');
const { updateBots } = require('../../client/src/game/bots.js');
const { SOLDIER, DIFFICULTY, BANANA_METER } = require('../../client/src/game/config.js');

// Starts an online match with one player using fake timers (t.mock.timers), so the tests
// can jump forward in time instantly. Records every message the server would send.
// pressE() acts as the player pressing E on a banana crate; offers() lists puzzle offers sent.
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

// Proves opening a crate sends a puzzle with the room's time limit, and the solver is frozen
// and cannot be hurt, so nobody is punished for answering a puzzle.
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

// Proves bots do not target a player who is busy with a crate puzzle.
test('bots do not pick a player who is solving a crate puzzle', (t) => {
  const { world, me, pressE } = setup(t);
  me.shieldTimer = 0;
  pressE();
  me.shieldTimer = 0;
  updateBots(world, 1 / 30);
  assert.ok(world.soldiers.every((s) => s.brain?.target?.soldier !== me));
});

// Proves a wrong answer uses up the crate, keeps the player protected while the answer
// is shown, and then gives a short exit shield.
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

// Proves "Leave it" ends the freeze with a shield and leaves the crate for someone else.
test('"Leave it" gives the exit shield and leaves the crate for someone else', (t) => {
  const { match, me, crate, pressE } = setup(t);
  pressE();
  match.cancelCrate('1');
  assert.equal(me.busy, false);
  assert.equal(me.shieldTimer, SOLDIER.spawnShield);
  assert.equal(crate.active, true);
  assert.equal(match.canAsk('1', 'crate'), false);
});

// Proves a right answer offers powers, and choosing one ends the freeze.
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

// Proves the server closes a puzzle nobody answers, so a player cannot stay frozen
// forever, and a late answer after that gives nothing.
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

// Proves a 5 second cooldown stops a player spamming crate puzzles.
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

// Proves stop() clears the timers, so nothing fires after a match has ended.
test('stop() clears the crate timers', (t) => {
  const { match, sent, pressE, tick } = setup(t);
  pressE();
  match.stop();
  tick(60000);
  assert.equal(sent.some((m) => m.event === 'puzzle:closed'), false);
});

// Proves the online respawn puzzle allows one try per death, not unlimited guesses.
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

// Proves two players cannot open the same crate at the same time (only the first gets the puzzle).
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

// Proves the Banana Meter also works online: answers fill it, and a full meter calls
// a supply drop that offers a free power without a puzzle.
test('online answers fill the Banana Meter; a full meter calls a supply drop that offers a free power', (t) => {
  const { match, world, me, sent, tick } = setup(t);
  match.applyPuzzle('1', 'respawn', true, 'gold');
  assert.ok(me.meter > 0, 'a gold answer adds to the meter');
  me.meter = BANANA_METER.max;
  me.alive = true;
  match.setControls('1', { supply: true });
  tick(40);
  assert.equal(me.meter, 0, 'the drop empties the meter');
  const drop = world.pickups.find((p) => p.supply);
  assert.ok(drop, 'a supply crate lands');
  world.emit('banana:crate', { soldier: me, pickup: drop });
  const offer = sent.findLast((m) => m.event === 'power:offer');
  assert.equal(offer.payload.choices.length, BANANA_METER.supplyChoices);
  assert.equal(sent.some((m) => m.event === 'puzzle:offer'), false, 'no puzzle for a supply crate');
  assert.equal(me.busy, true);
  assert.ok(match.choosePower('1', offer.payload.choices[0]));
  assert.equal(me.busy, false);
});
