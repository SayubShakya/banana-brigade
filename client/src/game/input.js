// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { emit, on } from '../services/eventBus.js';
import { isAimedAtEnemy, assistAim } from './autoFire.js';
import { tutorialTick } from './tutorial.js';
import { activeGun } from './world.js';

const MOVE_KEYS = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'jet', ArrowUp: 'jet', Space: 'jet',
};
const ACTION_KEYS = { KeyR: 'reload', KeyQ: 'swap', KeyG: 'grenade', KeyF: 'melee', KeyV: 'melee', KeyE: 'pickup' };

export function toggleHelp(el = document.getElementById('hud-help')) {
  if (!el) return false;
  const showing = !el.hidden && !el.classList.contains('fade');
  el.hidden = false;
  el.classList.toggle('fade', showing);
  return !showing;
}

export const ZOOM_ENGAGED_LEVEL = 2;

export function zoomLabel(engaged, sniper) {
  if (!engaged) return '1x';
  return sniper ? 'SCOPE' : 'FAR';
}

export function faceToward(mouse, center, dir) {
  const dx = mouse.x - center.x;
  if (!dir || Math.sign(dx) === dir) return mouse.x;
  return center.x + dir * Math.max(Math.abs(dx), 160);
}

export function createZoom(onChange = () => {}) {
  let toggled = false;
  let holding = false;
  let gun = null;
  const engaged = () => toggled || holding;
  const sniper = () => gun === 'sniper';
  const state = () => ({
    engaged: engaged(),
    scoped: engaged() && sniper(),
    zoomLabel: zoomLabel(engaged(), sniper()),
    level: engaged() ? ZOOM_ENGAGED_LEVEL : 0,
  });
  const change = (fn) => {
    const before = state();
    fn();
    const after = state();
    if (before.engaged !== after.engaged || before.zoomLabel !== after.zoomLabel) onChange(after);
  };
  return {
    get engaged() { return engaged(); },
    get scoped() { return state().scoped; },
    get zoomLabel() { return state().zoomLabel; },
    get level() { return state().level; },
    toggle() { change(() => { toggled = !engaged(); holding = false; }); },
    hold(down) { change(() => { holding = !!down; }); },
    wheel(deltaY) {
      if (!deltaY) return;
      const zoomIn = deltaY < 0;
      change(() => {
        const want = sniper() ? zoomIn : !zoomIn;
        toggled = want;
        if (!want) holding = false;
      });
    },
    setGun(key) {
      if (key === gun) return;
      change(() => {
        if (gun !== null) { toggled = false; holding = false; }
        gun = key;
      });
    },
    reset() { change(() => { toggled = false; holding = false; }); },
  };
}

function joystick(base, onMove) {
  const knob = base.querySelector('.knob');
  let id = null;
  const radius = () => base.clientWidth / 2;
  const move = (e) => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    const max = radius();
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    onMove(dx / max, dy / max);
  };
  base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.setPointerCapture(id); move(e); e.preventDefault(); });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    knob.style.transform = '';
    onMove(0, 0);
  };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
}

export function createInput(canvas, renderer) {
  const held = { left: false, right: false, jet: false, fire: false };
  const pending = { reload: false, swap: false, grenade: false, melee: false, pickup: false };
  const mouse = { x: 640, y: 360 };
  const stickAim = { active: false, x: 0, y: 0 };
  const touchMove = { x: 0, y: 0 };
  let enabled = false;
  let me = null;
  const zoom = createZoom((st) => emit('input:zoom', st));
  let autoFire = true;
  let lastDir = 0;
  let lastJet = false;

  const press = (action) => { if (enabled) pending[action] = true; };
  const mine = (s) => s && s === me;
  on('soldier:killed', ({ victim }) => { if (mine(victim)) zoom.reset(); });
  on('weapon:reloading', ({ soldier }) => { if (mine(soldier)) zoom.reset(); });
  on('weapon:switched', ({ soldier }) => { if (mine(soldier)) zoom.reset(); });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { emit('input:pause'); return; }
    if (!enabled || e.target.tagName === 'INPUT') return;
    if (e.code === 'Tab') { e.preventDefault(); emit('input:scoreboard', { show: true }); return; }
    if (e.code === 'KeyZ' && !e.repeat) zoom.toggle();
    if (e.code === 'KeyM' && !e.repeat) emit('input:minimap', { visible: renderer.toggleMinimap?.() });
    if (e.code === 'KeyB' && !e.repeat) emit('input:banana');
    if (e.code === 'KeyH' && !e.repeat) emit('input:help', { visible: toggleHelp() });
    if (MOVE_KEYS[e.code]) { held[MOVE_KEYS[e.code]] = true; e.preventDefault(); }
    if (ACTION_KEYS[e.code] && !e.repeat) pending[ACTION_KEYS[e.code]] = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') { emit('input:scoreboard', { show: false }); return; }
    if (MOVE_KEYS[e.code]) held[MOVE_KEYS[e.code]] = false;
  });

  canvas.addEventListener('mousemove', (e) => Object.assign(mouse, renderer.toView(e.clientX, e.clientY)));
  canvas.addEventListener('mousedown', (e) => {
    if (!enabled) return;
    if (e.button === 0) held.fire = true;
    if (e.button === 2) zoom.hold(true);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) held.fire = false;
    if (e.button === 2) zoom.hold(false);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (enabled) zoom.wheel(e.deltaY); e.preventDefault(); }, { passive: false });
  window.addEventListener('blur', () => { Object.keys(held).forEach((k) => { held[k] = false; }); zoom.hold(false); });

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const a = btn.dataset.action;
      if (a === 'zoom') { if (enabled) zoom.toggle(); }
      else if (a === 'pause') emit('input:pause');
      else press(a);
    });
  });

  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.add('touch'); }, { once: false });
  if (window.matchMedia?.('(pointer: coarse)').matches) document.body.classList.add('touch');
  joystick(document.getElementById('stick-move'), (x, y) => { touchMove.x = x; touchMove.y = y; });
  joystick(document.getElementById('stick-aim'), (x, y) => {
    stickAim.active = Math.hypot(x, y) > 0.15;
    stickAim.x = x; stickAim.y = y;
  });

  return {
    mouse,
    get zoom() { return zoom.level; },
    get scoped() { return zoom.scoped; },
    get zoomLabel() { return zoom.zoomLabel; },
    resetZoom() { zoom.reset(); emit('input:zoom', { level: 0, scoped: false, zoomLabel: zoom.zoomLabel }); },
    setEnabled(isOn) {
      enabled = isOn;
      if (!isOn) { Object.keys(held).forEach((k) => { held[k] = false; }); zoom.hold(false); }
    },
    setAutoFire(on) { autoFire = on !== false; },
    apply(player, world) {
      const c = player.controls;
      me = player;
      zoom.setGun(activeGun(player).key);
      c.left = held.left || touchMove.x < -0.3;
      c.right = held.right || touchMove.x > 0.3;
      c.jet = held.jet || touchMove.y < -0.45;
      c.fire = held.fire || (stickAim.active && Math.hypot(stickAim.x, stickAim.y) > 0.75);
      const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
      if (dir && dir !== lastDir && !stickAim.active) mouse.x = faceToward(mouse, renderer.toViewFromWorld(player.x + player.w / 2, player.y + 25), dir);
      if (stickAim.active) {
        const cx = player.x + player.w / 2;
        const cy = player.y + 25;
        c.aimX = cx + stickAim.x * 400;
        c.aimY = cy + stickAim.y * 400;
        const v = renderer.toViewFromWorld(c.aimX, c.aimY);
        mouse.x = v.x; mouse.y = v.y;
      } else {
        const aim = renderer.toWorld(mouse.x, mouse.y);
        c.aimX = aim.x;
        c.aimY = aim.y;
      }
      const assisted = assistAim(world, player, { x: c.aimX, y: c.aimY });
      c.aimX = assisted.x;
      c.aimY = assisted.y;
      if (dir !== lastDir) { lastDir = dir; emit('input:move', { dir, time: world?.time ?? 0 }); }
      if (c.jet !== lastJet) { lastJet = c.jet; emit('input:jet', { on: c.jet, time: world?.time ?? 0 }); }
      tutorialTick(world);
      if (autoFire && !c.fire && world) c.fire = isAimedAtEnemy(player, world);
      for (const k of Object.keys(pending)) {
        if (pending[k]) { c[k] = true; pending[k] = false; }
      }
    },
  };
}
