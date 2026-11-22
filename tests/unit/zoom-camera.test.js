// Unit tests for the zoom controls (client/src/game/input.js) and the camera
// (client/src/game/render.js) that keeps the player in view while aiming.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createZoom, ZOOM_ENGAGED_LEVEL } = require('../../client/src/game/input.js');
const { playerScreenTarget, cameraTarget, keepInBox, SAFE_BOX, HARD_BOX, LOOK, ZOOM_SCALE } = require('../../client/src/game/render.js');
const { VIEW, ZOOM_LEVELS, WEAPONS } = require('../../client/src/game/config.js');

// Creates a zoom controller for the given gun and records each state it reports.
function zoomWith(gun) {
  const events = [];
  const z = createZoom((st) => events.push(st));
  z.setGun(gun);
  return { z, events };
}

// Proves Z turns the sniper scope on and off and the label updates each time.
test('Z toggles the sniper scope on and off', () => {
  const { z, events } = zoomWith('sniper');
  z.toggle();
  assert.equal(z.scoped, true);
  assert.equal(z.zoomLabel, 'SCOPE');
  assert.equal(z.level, ZOOM_ENGAGED_LEVEL);
  z.toggle();
  assert.equal(z.scoped, false);
  assert.equal(z.zoomLabel, '1x');
  assert.deepEqual(events.map((e) => e.zoomLabel), ['SCOPE', '1x']);
});

// Proves holding the right mouse button scopes only while it is held.
test('holding the right button scopes only while held', () => {
  const { z } = zoomWith('sniper');
  z.hold(true);
  assert.equal(z.scoped, true);
  z.hold(false);
  assert.equal(z.scoped, false);
});

// Proves letting go of a hold does not cancel a scope that was toggled on.
test('releasing a hold keeps a scope that was toggled on', () => {
  const { z } = zoomWith('sniper');
  z.toggle();
  z.hold(true);
  z.hold(false);
  assert.equal(z.scoped, true);
});

// Proves guns other than the sniper get a wider FAR view instead of a scope.
test('other guns get the FAR view instead of a scope', () => {
  const { z } = zoomWith('rifle');
  z.toggle();
  assert.equal(z.engaged, true);
  assert.equal(z.scoped, false);
  assert.equal(z.zoomLabel, 'FAR');
});

// Proves changing weapon resets the zoom.
test('swapping weapon resets the zoom', () => {
  const { z } = zoomWith('sniper');
  z.toggle();
  z.setGun('magnum');
  assert.equal(z.engaged, false);
  z.hold(true);
  z.setGun('sniper');
  assert.equal(z.engaged, false);
});

// Proves dying or reloading clears the zoom.
test('reset (death or reload) clears both toggle and hold', () => {
  const { z } = zoomWith('sniper');
  z.toggle();
  z.hold(true);
  z.reset();
  assert.equal(z.engaged, false);
  assert.equal(z.level, 0);
});

// Proves the mouse wheel zooms in and out within limits and never wraps around.
test('the wheel zooms in and out within bounds and never wraps', () => {
  const sniper = zoomWith('sniper').z;
  for (let i = 0; i < 5; i++) sniper.wheel(-100);
  assert.equal(sniper.scoped, true);
  for (let i = 0; i < 5; i++) sniper.wheel(100);
  assert.equal(sniper.engaged, false);
  const rifle = zoomWith('rifle').z;
  for (let i = 0; i < 5; i++) rifle.wheel(100);
  assert.equal(rifle.zoomLabel, 'FAR');
  rifle.wheel(-100);
  assert.equal(rifle.zoomLabel, '1x');
});

// Proves the zoom level still maps to the old ZOOM_LEVELS table for every weapon.
test('the engaged level still maps below 1x through the existing ZOOM_LEVELS lookup', () => {
  for (const key of Object.keys(WEAPONS)) {
    const maxZoom = (WEAPONS[key].zoom ?? 2) - 1;
    assert.ok(ZOOM_LEVELS[Math.min(ZOOM_ENGAGED_LEVEL, maxZoom)] < 1, key);
    assert.equal(ZOOM_LEVELS[Math.min(0, maxZoom)], 1, key);
  }
});

// Proves the scope zooms in and the FAR view zooms out.
test('the scope zooms in and the FAR view zooms out', () => {
  assert.ok(ZOOM_SCALE.scope > 1);
  assert.ok(ZOOM_SCALE.far < 1);
});

// Mouse positions at the screen corners and centre, and sample movement leads, used below.
const corners = [
  { x: 0, y: 0 }, { x: VIEW.width, y: 0 }, { x: 0, y: VIEW.height }, { x: VIEW.width, y: VIEW.height }, { x: VIEW.width / 2, y: VIEW.height / 2 },
];
const leads = [{ x: 60, y: 36 }, { x: -60, y: -36 }, { x: 0, y: 0 }];

// Proves the camera look-ahead never pushes the player outside the safe box on screen,
// for every zoom, mouse position and movement direction.
test('look-ahead is capped so the player stays inside the safe box', () => {
  for (const scale of [ZOOM_SCALE.far, 1, ZOOM_SCALE.scope]) {
    for (const look of Object.values(LOOK)) {
      for (const mouse of corners) {
        for (const lead of leads) {
          const s = playerScreenTarget({ mouse, lead, scale, look });
          assert.ok(s.x >= VIEW.width * 0.25 && s.x <= VIEW.width * 0.75, `x ${s.x}`);
          assert.ok(s.y >= VIEW.height * 0.275 && s.y <= VIEW.height * 0.725, `y ${s.y}`);
          assert.ok(s.x <= VIEW.width * SAFE_BOX.right && s.y <= VIEW.height * SAFE_BOX.bottom);
        }
      }
    }
  }
});

// Proves the camera target puts the player exactly where the safe box says.
test('the camera target puts the player where the safe box says, away from the map edge', () => {
  const map = { width: 3600, height: 1440 };
  const px = 1800;
  const py = 700;
  for (const scale of [ZOOM_SCALE.far, 1, ZOOM_SCALE.scope]) {
    const cam = cameraTarget({ px, py, mouse: { x: VIEW.width, y: VIEW.height }, lead: { x: 60, y: 36 }, scale, look: LOOK.scope, map });
    const sx = (px - cam.x) * scale;
    const sy = (py - cam.y) * scale;
    assert.ok(Math.abs(sx - VIEW.width * SAFE_BOX.left) < 1e-6);
    assert.ok(Math.abs(sy - VIEW.height * SAFE_BOX.top) < 1e-6);
  }
});

// Proves a lagging camera is pulled back so the player never leaves the hard box.
test('a lagging camera is pulled back so the player never leaves the hard box', () => {
  const map = { width: 3600, height: 1440 };
  const cam = keepInBox({ x: 0, y: 0 }, 1800, 700, 1, map);
  const sx = 1800 - cam.x;
  const sy = 700 - cam.y;
  assert.ok(sx <= VIEW.width * HARD_BOX.right + 1e-6 && sx >= VIEW.width * HARD_BOX.left - 1e-6);
  assert.ok(sy <= VIEW.height * HARD_BOX.bottom + 1e-6 && sy >= VIEW.height * HARD_BOX.top - 1e-6);
});

// Proves pressing A or D turns the soldier to that side, even when aiming the other way or straight up.
test('pressing A or D turns the soldier to that side when the aim points the other way or straight up', () => {
  const { faceToward } = require('../../client/src/game/input.js');
  const me = { x: 600, y: 360 };
  assert.equal(faceToward({ x: 600, y: 100 }, me, -1), 440);
  assert.equal(faceToward({ x: 600, y: 100 }, me, 1), 760);
  assert.equal(faceToward({ x: 900, y: 360 }, me, -1), 300);
  assert.equal(faceToward({ x: 300, y: 360 }, me, -1), 300);
  assert.equal(faceToward({ x: 300, y: 360 }, me, 0), 300);
});
