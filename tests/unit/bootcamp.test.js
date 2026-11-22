// Unit tests for Boot Camp (the tutorial), aim assist on Easy, and the short pause
// before easy bots start shooting.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTutorial, STEPS, JET_HOLD, setUpRange, tutorialTick, CRATE_RETURN, CRATE_STEP, BOOT_CAMP } = require('../../client/src/game/tutorial.js');
const { assistAim, aimAssistOn, AIM_ASSIST } = require('../../client/src/game/autoFire.js');
const { updateBots, EASY_HESITATION, hesitating } = require('../../client/src/game/bots.js');
const { createWorld } = require('../../client/src/game/world.js');
const { DIFFICULTY } = require('../../client/src/game/config.js');

// Stand-in soldiers used as event payloads: the player, a training dummy and a bot.
const me = { isPlayer: true };
const dummy = { isDummy: true };
const bot = { isPlayer: false };

// The list of events that completes every tutorial step in the right order.
const RUN = [
  ['input:move', { dir: -1 }], ['input:move', { dir: 1 }],
  ['input:jet', { on: true, time: 1 }], ['input:jet', { on: false, time: 1 + JET_HOLD }],
  ['soldier:damaged', { victim: dummy, attacker: me }],
  ['pickup:taken', { kind: 'weapon', soldier: me }],
  ['banana:crate', { soldier: me }],
  ['banana:answered', { purpose: 'crate', correct: true }],
  ['power:start', { soldier: me }],
];

// Proves the tutorial is event-driven: the right events move it through every step to the end.
test('boot camp: the right events walk through every step in order', () => {
  const t = createTutorial();
  assert.equal(t.step.id, 'move');
  for (const [name, payload] of RUN) t.handle(name, payload);
  assert.equal(t.step.id, 'done');
  assert.equal(t.done, true);
  assert.equal(t.index, STEPS.length - 1);
});

// Proves steps must be done in order; doing a later step early does nothing.
test('boot camp: a later step cannot be done early', () => {
  const t = createTutorial();
  for (const [name, payload] of RUN.slice(4)) assert.equal(t.handle(name, payload), false);
  assert.equal(t.step.id, 'move');
});

// Proves the move step needs both left and right before it is done.
test('boot camp: moving needs both directions', () => {
  const t = createTutorial();
  t.handle('input:move', { dir: 1 });
  t.handle('input:move', { dir: 0 });
  t.handle('input:move', { dir: 1 });
  assert.equal(t.step.id, 'move');
  t.handle('input:move', { dir: -1 });
  assert.equal(t.step.id, 'jet');
});

// Proves the jetpack step needs a real hold, not a quick tap.
test('boot camp: a tap on the jetpack is not enough, a hold is', () => {
  const t = createTutorial();
  for (const [name, payload] of RUN.slice(0, 2)) t.handle(name, payload);
  t.handle('input:jet', { on: true, time: 5 });
  t.handle('input:jet', { on: false, time: 5.1 });
  assert.equal(t.step.id, 'jet');
  t.handle('input:jet', { on: true, time: 6 });
  t.handle('input:jet', { on: false, time: 6 + JET_HOLD });
  assert.equal(t.step.id, 'shoot');
});

// Proves only the player shooting a dummy counts, not a bot or another target.
test('boot camp: only the player hitting a dummy counts as a shot', () => {
  const t = createTutorial();
  for (const [name, payload] of RUN.slice(0, 4)) t.handle(name, payload);
  t.handle('soldier:damaged', { victim: dummy, attacker: bot });
  t.handle('soldier:damaged', { victim: bot, attacker: me });
  assert.equal(t.step.id, 'shoot');
  t.handle('soldier:damaged', { victim: dummy, attacker: me });
  assert.equal(t.step.id, 'gun');
});

// Proves a wrong crate answer sends the player back to the crate step to try again.
test('boot camp: a wrong crate answer sends you back to the crate step', () => {
  const t = createTutorial();
  for (const [name, payload] of RUN.slice(0, 7)) t.handle(name, payload);
  assert.equal(t.step.id, 'puzzle');
  t.handle('banana:answered', { purpose: 'respawn', correct: true });
  assert.equal(t.step.id, 'puzzle');
  assert.equal(t.handle('banana:answered', { purpose: 'crate', correct: false }), true);
  assert.equal(t.step.id, 'crate');
  t.handle('banana:crate', { soldier: me });
  t.handle('banana:answered', { purpose: 'crate', correct: true });
  assert.equal(t.step.id, 'power');
});

// Creates a world for these tests (quick match on Easy unless opts say otherwise).
function world(opts = {}) {
  return createWorld({
    mode: 'quick', playerName: 'Tester', playerAvatar: {}, difficulty: 'easy',
    botAvatars: [{ bot: 0 }], botNames: ['Rex', 'Viper', 'Ghost', 'Blaze', 'Tank'], emit: () => {}, ...opts,
  });
}

// Proves the shooting range keeps two dummies and used crates come back quickly.
test('boot camp: the range keeps two dummies and crates come back fast', () => {
  const w = world({ mode: 'training', mission: BOOT_CAMP });
  assert.equal(w.map.id, 'jungle');
  setUpRange(w.soldiers);
  assert.equal(w.soldiers.filter((s) => s.isDummy).length, 2);
  const crate = w.pickups.find((p) => p.kind === 'banana');
  crate.active = false;
  crate.timer = 40;
  tutorialTick(w);
  assert.equal(crate.timer, CRATE_RETURN);
});

// Proves banana crates are hidden until the tutorial reaches the crate step,
// and that this only happens in Boot Camp, not in a normal match.
test('boot camp: banana crates stay hidden until the crate step', () => {
  const w = world({ mode: 'training', mission: BOOT_CAMP });
  const crates = w.pickups.filter((p) => p.kind === 'banana');
  const homes = crates.map((p) => p.x);
  tutorialTick(w, 0);
  assert.ok(crates.every((p) => p.x < 0));
  tutorialTick(w, CRATE_STEP);
  assert.deepEqual(crates.map((p) => p.x), homes);
  const quick = world();
  const before = quick.pickups.map((p) => p.x);
  tutorialTick(quick, 0);
  assert.deepEqual(quick.pickups.map((p) => p.x), before);
});

// Sets up the player with one enemy in an open map and an aim 2 degrees off the enemy.
function aimSetup(difficulty, mode = 'quick') {
  const w = world({ difficulty });
  w.mode = mode;
  const p = w.player;
  const enemy = w.soldiers[1];
  w.soldiers.slice(2).forEach((s) => { s.alive = false; });
  const spot = w.map.spawns[0];
  Object.assign(p, { x: spot.x - p.w / 2, y: spot.y - 400 });
  Object.assign(enemy, { x: p.x + 250, y: p.y });
  w.map = { ...w.map, grid: w.map.grid.map((row) => row.map(() => 0)) };
  const sy = p.y + 25;
  const sx = p.x + p.w / 2;
  const ey = enemy.y + enemy.h / 2;
  const ex = enemy.x + enemy.w / 2;
  const enemyAngle = Math.atan2(ey - sy, ex - sx);
  const aimAngle = enemyAngle - (2 * Math.PI) / 180;
  const aim = { x: sx + Math.cos(aimAngle) * 250, y: sy + Math.sin(aimAngle) * 250 };
  return { w, p, aim, sx, sy, enemyAngle, aimAngle };
}

// Proves aim assist on Easy bends the shot toward the enemy, but by no more than 3 degrees.
test('aim assist: on Easy offline the shot bends toward the enemy, by no more than 3 degrees', () => {
  const { w, p, aim, sx, sy, enemyAngle, aimAngle } = aimSetup('easy');
  assert.equal(aimAssistOn(w, p), true);
  const out = assistAim(w, p, aim);
  const bent = Math.atan2(out.y - sy, out.x - sx);
  assert.ok(Math.abs(bent - enemyAngle) < Math.abs(aimAngle - enemyAngle));
  assert.ok(Math.abs(bent - aimAngle) <= AIM_ASSIST.maxBend + 1e-9);
});

// Proves aim assist is off on Medium and Hard.
test('aim assist: off on Medium and Hard', () => {
  for (const d of ['medium', 'hard']) {
    const { w, p, aim } = aimSetup(d);
    assert.equal(aimAssistOn(w, p), false);
    assert.deepEqual(assistAim(w, p, aim), aim);
  }
});

// Proves aim assist is never used online, so online play stays fair.
test('aim assist: never in online play', () => {
  const { w, p, aim } = aimSetup('easy', 'online');
  assert.equal(aimAssistOn(w, p), false);
  assert.deepEqual(assistAim(w, p, aim), aim);
  const view = { ...w, mode: 'quick', difficulty: undefined };
  assert.equal(aimAssistOn(view, p), false);
});

// Proves aim assist ignores enemies well away from where the player is aiming.
test('aim assist: ignores enemies far outside the aim cone', () => {
  const { w, p, sx, sy, enemyAngle } = aimSetup('easy');
  const away = enemyAngle + Math.PI / 2;
  const aim = { x: sx + Math.cos(away) * 300, y: sy + Math.sin(away) * 300 };
  assert.deepEqual(assistAim(w, p, aim), aim);
});

// Proves easy bots do not shoot or throw grenades in the first 30 seconds.
test('bots on Easy hold fire for the first 30 seconds only', () => {
  const w = world({ difficulty: 'easy' });
  assert.equal(EASY_HESITATION, 30);
  assert.equal(hesitating(w), true);
  const enemy = w.soldiers[1];
  w.soldiers.slice(2).forEach((s) => { s.alive = false; });
  Object.assign(enemy.controls, { fire: true });
  enemy.brain = undefined;
  w.time = 10;
  updateBots(w, 1 / 60);
  assert.equal(enemy.controls.fire, false);
  assert.equal(enemy.controls.grenade, false);
  w.time = EASY_HESITATION + 1;
  assert.equal(hesitating(w), false);
});

// Proves Medium bots shoot straight away.
test('bots on Medium do not hesitate', () => {
  const w = world({ difficulty: 'medium' });
  assert.equal(w.difficulty, DIFFICULTY.medium);
  assert.equal(hesitating(w), false);
});
