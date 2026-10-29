// Keyboard, mouse, on-screen buttons and touch joysticks. Browser events are turned
// into the player's controls; menu keys are re-published on the event bus as
// "input:pause" and "input:scoreboard".
//
//   A / D or ← / →   move              W or Space   jetpack
//   Mouse            aim               Left click   shoot
//   R reload   Q switch weapon   G or right click grenade   F melee   E pick up
//   Z or mouse wheel zoom   B banana respawn   Tab scoreboard   Esc pause
//
// On touch screens the left stick moves and flies (push up), the right stick aims
// and fires when pushed far enough, like the original dual-stick layout.
//
// Auto-fire (on by default, Settings → Auto-fire): just aim at an enemy with the
// mouse or the right stick and the gun fires by itself (see autoFire.js).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { emit } from '../eventBus.js';
import { isAimedAtEnemy } from './autoFire.js';

const MOVE_KEYS = {
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyW: 'jet', ArrowUp: 'jet', Space: 'jet',
};
const ACTION_KEYS = { KeyR: 'reload', KeyQ: 'swap', KeyG: 'grenade', KeyF: 'melee', KeyV: 'melee', KeyE: 'pickup' };

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
  let zoom = 0;
  let enabled = false;
  let autoFire = true;

  const press = (action) => { if (enabled) pending[action] = true; };
  const cycleZoom = () => { zoom = (zoom + 1) % 3; emit('input:zoom', { level: zoom }); };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { emit('input:pause'); return; }
    if (!enabled || e.target.tagName === 'INPUT') return;
    if (e.code === 'Tab') { e.preventDefault(); emit('input:scoreboard', { show: true }); return; }
    if (e.code === 'KeyZ' && !e.repeat) cycleZoom();
    if (e.code === 'KeyB' && !e.repeat) emit('input:banana');
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
    if (e.button === 2) pending.grenade = true;
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) held.fire = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { if (enabled) cycleZoom(); e.preventDefault(); }, { passive: false });
  window.addEventListener('blur', () => { Object.keys(held).forEach((k) => { held[k] = false; }); });

  // On-screen HUD buttons (work with mouse and touch).
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const a = btn.dataset.action;
      if (a === 'zoom') { if (enabled) cycleZoom(); }
      else if (a === 'pause') emit('input:pause');
      else press(a);
    });
  });

  // Touch: show the joysticks the first time the screen is touched.
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.add('touch'); }, { once: false });
  // A phone or tablet: touch layout from the start (sticks, no keyboard hints).
  if (window.matchMedia?.('(pointer: coarse)').matches) document.body.classList.add('touch');
  joystick(document.getElementById('stick-move'), (x, y) => { touchMove.x = x; touchMove.y = y; });
  joystick(document.getElementById('stick-aim'), (x, y) => {
    stickAim.active = Math.hypot(x, y) > 0.15;
    stickAim.x = x; stickAim.y = y;
  });

  return {
    mouse,
    get zoom() { return zoom; },
    // A new battle starts unzoomed.
    resetZoom() { zoom = 0; emit('input:zoom', { level: 0 }); },
    setEnabled(on) {
      enabled = on;
      if (!on) Object.keys(held).forEach((k) => { held[k] = false; });
    },
    setAutoFire(on) { autoFire = on !== false; },
    // Copy the current input into the player's controls once per frame. `world` is
    // the match the player is in (local world or online view), used by auto-fire.
    apply(player, world) {
      const c = player.controls;
      c.left = held.left || touchMove.x < -0.3;
      c.right = held.right || touchMove.x > 0.3;
      c.jet = held.jet || touchMove.y < -0.45;
      c.fire = held.fire || (stickAim.active && Math.hypot(stickAim.x, stickAim.y) > 0.75);
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
      // Auto-fire once the aim (worked out above) is on an enemy in range and in sight.
      if (autoFire && !c.fire && world) c.fire = isAimedAtEnemy(player, world);
      for (const k of Object.keys(pending)) {
        if (pending[k]) { c[k] = true; pending[k] = false; }
      }
    },
  };
}
