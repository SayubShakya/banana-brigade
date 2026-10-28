// Shooting feel for the renderer: muzzle flashes, recoil, sniper beams, wall sparks,
// shell casings, hit markers, floating damage numbers, the damage-direction arrow,
// the KILL pop and screen shake. Nothing here changes the game: it only listens to
// the events the world publishes on the event bus (weapon:fired, soldier:damaged,
// soldier:killed, explosion), so it works the same in local and online games.
// Every effect lives in a small fixed-size pool (a ring buffer), so a busy fight
// never allocates new objects each frame and the counts stay capped.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../eventBus.js';
import { VIEW, WEAPONS } from './config.js';
import { raycast } from './map.js';

// Visual recoil of the gun (px) and how much it kicks the camera, per weapon.
const KICK = { magnum: 5, smg: 2.5, rifle: 3.5, shotgun: 9, sniper: 12, rocket: 10, flamer: 0 };
const CAM_KICK = { magnum: 2, smg: 1, rifle: 1.5, shotgun: 5, sniper: 7, rocket: 6, flamer: 0 };
const FLASH_LIFE = { magnum: 0.06, smg: 0.04, rifle: 0.05, shotgun: 0.08, sniper: 0.1, rocket: 0.09 };
const GRAVITY = 1400;

// A ring buffer of reusable objects: spawn() hands out the next slot, overwriting the oldest.
function makePool(size, make) {
  const items = Array.from({ length: size }, () => ({ ...make(), active: false }));
  let next = 0;
  return {
    items,
    spawn() { const it = items[next]; next = (next + 1) % size; it.active = true; it.age = 0; return it; },
    clear() { for (const it of items) it.active = false; },
  };
}

const rand = (a, b) => a + Math.random() * (b - a);

// Liang-Barsky segment vs box test; returns the hit fraction or null (same maths as the world).
function segmentHitsBox(x0, y0, x1, y1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const ps = [-dx, dx, -dy, dy];
  const qs = [x0 - b.x, b.x + b.w - x0, y0 - b.y, b.y + b.h - y0];
  for (let i = 0; i < 4; i++) {
    const p = ps[i], q = qs[i];
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return t0;
}

// view: { toViewFromWorld(x, y), onScreen(x, y) } from the renderer.
export function createEffects(view) {
  let world = null;

  const flashes = makePool(24, () => ({ soldier: null, kind: 'magnum', age: 0, life: 0.05 }));
  const beams = makePool(8, () => ({ x1: 0, y1: 0, x2: 0, y2: 0, age: 0, life: 0.35 }));
  const impacts = makePool(32, () => ({ x: 0, y: 0, delay: 0, age: 0 }));
  const sparks = makePool(96, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.3, size: 2, color: '#fff' }));
  const shells = makePool(24, () => ({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, age: 0, life: 0.7, color: '#d4a017' }));
  const numbers = makePool(24, () => ({ victim: null, x: 0, y: 0, value: 0, age: 0, life: 0.9, mine: false }));
  const arrows = makePool(4, () => ({ ax: 0, ay: 0, age: 0, life: 1.1 }));
  const recoil = new Map();   // soldier -> current gun offset in px
  const marker = { age: 9, life: 0.25, kill: false };
  const killPop = { age: 9, life: 0.9, streak: 0 };
  const kick = { x: 0, y: 0 };
  let shake = 0;
  let streak = 0;
  let banners = true;
  const offset = { x: 0, y: 0 };

  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => reduced?.matches || document.body.classList.contains('a11y-calm');

  function reset() {
    for (const p of [flashes, beams, impacts, sparks, shells, numbers, arrows]) p.clear();
    recoil.clear();
    marker.age = killPop.age = 9;
    kick.x = kick.y = shake = 0;
    streak = 0;
  }

  const isMe = (s) => !!s && !!world && s === world.player;

  function addShake(amount) { if (!calm()) shake = Math.min(14, Math.max(shake, amount)); }

  // Where a bullet fired along `angle` will stop: a wall (spark there) or a soldier (no spark).
  function traceImpact(shooter, x, y, angle, w) {
    const ex = x + Math.cos(angle) * w.range;
    const ey = y + Math.sin(angle) * w.range;
    const wall = raycast(world.map, x, y, ex, ey, 8);
    const hx = wall ? wall.x : ex;
    const hy = wall ? wall.y : ey;
    for (const s of world.soldiers) {
      if (s === shooter || !s.alive) continue;
      if (segmentHitsBox(x, y, hx, hy, s) !== null) return { x: hx, y: hy, wall: false };
    }
    return { x: hx, y: hy, wall: !!wall };
  }

  on('match:started', reset);

  on('weapon:fired', ({ soldier, weapon, x, y }) => {
    if (!world || !soldier) return;
    const w = WEAPONS[weapon];
    if (!w) return;
    if (w.type !== 'flame') {
      const f = flashes.spawn();
      f.soldier = soldier; f.kind = weapon; f.life = FLASH_LIFE[weapon] ?? 0.05;
    }
    if (KICK[weapon]) recoil.set(soldier, KICK[weapon]);
    if (isMe(soldier) && !calm()) {
      kick.x -= Math.cos(soldier.aim) * CAM_KICK[weapon];
      kick.y -= Math.sin(soldier.aim) * CAM_KICK[weapon];
    }
    if (w.type !== 'bullet') return;

    // Wall sparks where the bullets will land (a few pellets of a shotgun blast is enough).
    const traces = Math.min(w.pellets, 3);
    for (let i = 0; i < traces; i++) {
      const hit = traceImpact(soldier, x, y, soldier.aim + rand(-w.spread, w.spread), w);
      if (weapon === 'sniper' && i === 0) {
        const b = beams.spawn();
        b.x1 = x; b.y1 = y; b.x2 = hit.x; b.y2 = hit.y; b.life = 0.35;
      }
      if (hit.wall) {
        const im = impacts.spawn();
        im.x = hit.x; im.y = hit.y; im.delay = Math.hypot(hit.x - x, hit.y - y) / w.speed;
      }
    }

    // A shell casing flies out of the gun, away from the aim side.
    const sh = shells.spawn();
    const back = Math.cos(soldier.aim) >= 0 ? -1 : 1;
    sh.x = soldier.x + soldier.w / 2; sh.y = soldier.y + 24;
    sh.vx = back * rand(80, 180); sh.vy = rand(-320, -200);
    sh.rot = 0; sh.vr = rand(-20, 20); sh.life = 0.7;
    sh.color = weapon === 'shotgun' ? '#c0392b' : '#d4a017';
  });

  on('soldier:damaged', ({ victim, attacker, amount }) => {
    if (!world || !victim) return;
    if (amount > 0) {
      // Pellets landing together add up into one number.
      let n = null;
      for (const it of numbers.items) if (it.active && it.victim === victim && it.age < 0.15) { n = it; break; }
      if (n) n.value += amount;
      else {
        n = numbers.spawn();
        n.victim = victim; n.value = amount; n.life = 0.9;
        n.x = victim.x + victim.w / 2 + rand(-10, 10); n.y = victim.y - 30;
      }
      n.mine = isMe(attacker) || isMe(victim);
    }
    if (isMe(attacker) && victim !== attacker) { marker.age = 0; marker.life = 0.25; marker.kill = false; }
    if (isMe(victim)) {
      if (amount >= 20) addShake(Math.min(10, amount * 0.2));
      if (attacker && attacker !== victim && !view.onScreen(attacker.x + attacker.w / 2, attacker.y + attacker.h / 2)) {
        const a = arrows.spawn();
        a.ax = attacker.x + attacker.w / 2; a.ay = attacker.y + attacker.h / 2; a.life = 1.1;
      }
    }
  });

  on('soldier:killed', ({ victim, killer }) => {
    if (!world) return;
    if (isMe(victim)) streak = 0;
    if (isMe(killer) && victim !== killer) {
      streak += 1;
      marker.age = 0; marker.life = 0.45; marker.kill = true;
      killPop.age = 0; killPop.streak = streak;
    }
  });

  on('explosion', ({ x, y, radius }) => {
    if (!world?.player) return;
    const p = world.player;
    const d = Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y);
    const reach = radius * 3;
    if (d < reach) addShake(12 * (1 - d / reach) + 2);
  });

  // Called once per frame by the renderer.
  function update(w, dt) {
    if (w !== world) { world = w; reset(); }
    for (const f of flashes.items) if (f.active && (f.age += dt) > f.life) f.active = false;
    for (const b of beams.items) if (b.active && (b.age += dt) > b.life) b.active = false;
    for (const im of impacts.items) {
      if (!im.active || (im.delay -= dt) > 0) continue;
      im.active = false;
      for (let i = 0; i < 5; i++) {
        const s = sparks.spawn();
        s.x = im.x; s.y = im.y; s.vx = rand(-160, 160); s.vy = rand(-260, -40);
        s.life = i < 3 ? rand(0.15, 0.3) : rand(0.35, 0.55);
        s.size = i < 3 ? 2 : 4;
        s.color = i < 3 ? '#fff3b0' : 'rgba(160,130,100,0.7)';   // bright sparks, then dust
      }
    }
    for (const s of sparks.items) {
      if (!s.active) continue;
      if ((s.age += dt) > s.life) { s.active = false; continue; }
      s.vy += GRAVITY * 0.6 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    }
    for (const s of shells.items) {
      if (!s.active) continue;
      if ((s.age += dt) > s.life) { s.active = false; continue; }
      s.vy += GRAVITY * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
    }
    for (const n of numbers.items) if (n.active && (n.age += dt) > n.life) n.active = false;
    for (const a of arrows.items) if (a.active && (a.age += dt) > a.life) a.active = false;
    for (const [s, r] of recoil) { const v = r - r * Math.min(1, dt * 14) - dt * 4; if (v <= 0) recoil.delete(s); else recoil.set(s, v); }
    marker.age += dt;
    killPop.age += dt;

    // Camera kick springs back; shake decays quickly.
    const k = Math.min(1, dt * 12);
    kick.x -= kick.x * k; kick.y -= kick.y * k;
    shake = Math.max(0, shake - shake * Math.min(1, dt * 7) - dt * 2);
    offset.x = kick.x + (shake ? rand(-shake, shake) : 0);
    offset.y = kick.y + (shake ? rand(-shake, shake) : 0);
  }

  // Muzzle flash shapes, drawn in world space at the end of the barrel (pointing along +x).
  function drawFlash(ctx, kind) {
    ctx.beginPath();
    if (kind === 'shotgun') {
      ctx.moveTo(0, -4); ctx.lineTo(26, -14); ctx.lineTo(20, 0); ctx.lineTo(26, 14); ctx.lineTo(0, 4);
    } else if (kind === 'sniper') {
      ctx.moveTo(0, -3); ctx.lineTo(44, 0); ctx.lineTo(0, 3);
      ctx.moveTo(6, 0); ctx.lineTo(12, -10); ctx.lineTo(14, 0); ctx.lineTo(12, 10);
    } else if (kind === 'smg') {
      ctx.moveTo(0, -3); ctx.lineTo(11, 0); ctx.lineTo(0, 3);
    } else if (kind === 'rocket') {
      ctx.arc(6, 0, 10, 0, Math.PI * 2);
    } else {
      ctx.moveTo(0, -5); ctx.lineTo(20, 0); ctx.lineTo(0, 5);
    }
    ctx.fill();
    ctx.fillStyle = '#fffbe6';
    ctx.beginPath(); ctx.arc(2, 0, kind === 'smg' ? 3 : kind === 'shotgun' ? 7 : 5, 0, Math.PI * 2); ctx.fill();
  }

  // World-space layer: drawn with the world transform, after projectiles.
  function drawWorld(ctx, cam) {
    ctx.lineCap = 'round';
    for (const b of beams.items) {
      if (!b.active) continue;
      const t = 1 - b.age / b.life;
      ctx.globalAlpha = t * 0.35;
      ctx.strokeStyle = '#bde0fe';
      ctx.lineWidth = 7 * t;
      ctx.beginPath(); ctx.moveTo(b.x1 - cam.x, b.y1 - cam.y); ctx.lineTo(b.x2 - cam.x, b.y2 - cam.y); ctx.stroke();
      ctx.globalAlpha = t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const f of flashes.items) {
      if (!f.active || !f.soldier.alive) continue;
      const s = f.soldier;
      const len = f.kind === 'sniper' ? 46 : f.kind === 'smg' ? 34 : 40;
      ctx.save();
      ctx.translate(s.x + s.w / 2 + Math.cos(s.aim) * len - cam.x, s.y + 25 + Math.sin(s.aim) * len - cam.y);
      ctx.rotate(s.aim);
      ctx.globalAlpha = 1 - f.age / f.life;
      ctx.fillStyle = f.kind === 'rocket' ? 'rgba(255,170,60,0.9)' : 'rgba(255,214,102,0.95)';
      drawFlash(ctx, f.kind);
      ctx.restore();
    }
    for (const s of sparks.items) {
      if (!s.active) continue;
      ctx.globalAlpha = 1 - s.age / s.life;
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - cam.x - s.size / 2, s.y - cam.y - s.size / 2, s.size, s.size);
    }
    for (const s of shells.items) {
      if (!s.active) continue;
      ctx.globalAlpha = Math.min(1, (s.life - s.age) * 4);
      ctx.save();
      ctx.translate(s.x - cam.x, s.y - cam.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.color;
      ctx.fillRect(-3, -1.5, 6, 3);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // Screen-space layer under the scope: floating damage numbers.
  function drawScreen(ctx) {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const n of numbers.items) {
      if (!n.active) continue;
      const t = n.age / n.life;
      const v = view.toViewFromWorld(n.x, n.y - t * 40);
      ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      ctx.font = `bold ${n.mine ? 18 : 14}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = n.mine ? (isMe(n.victim) ? '#ff6b6b' : '#ffe135') : '#ffffff';
      const text = String(Math.round(n.value));
      ctx.strokeText(text, v.x, v.y);
      ctx.fillText(text, v.x, v.y);
    }
    ctx.globalAlpha = 1;
  }

  // Top layer (over the scope): damage-direction arrows, hit marker and the KILL pop.
  function drawHud(ctx, mouse) {
    ctx.textAlign = 'center';
    const p = world?.player;
    if (p) {
      for (const a of arrows.items) {
        if (!a.active) continue;
        const ang = Math.atan2(a.ay - (p.y + p.h / 2), a.ax - (p.x + p.w / 2));
        const ex = VIEW.width / 2 + Math.cos(ang) * (VIEW.width / 2 - 36);
        const ey = VIEW.height / 2 + Math.sin(ang) * (VIEW.height / 2 - 36);
        ctx.globalAlpha = 0.85 * (1 - a.age / a.life);
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = '#e63946';
        ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, -16); ctx.lineTo(-2, 0); ctx.lineTo(-8, 16); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    if (marker.age < marker.life) {
      const t = marker.age / marker.life;
      const inner = marker.kill ? 8 : 6;
      const outer = (marker.kill ? 18 : 13) + t * 3;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = marker.kill ? '#ff3b3b' : '#ffffff';
      ctx.lineWidth = marker.kill ? 3 : 2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const dx = i % 2 ? 1 : -1;
        const dy = i < 2 ? 1 : -1;
        ctx.moveTo(mouse.x + dx * inner * 0.707, mouse.y + dy * inner * 0.707);
        ctx.lineTo(mouse.x + dx * outer * 0.707, mouse.y + dy * outer * 0.707);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (killPop.age < killPop.life) {
      const t = killPop.age / killPop.life;
      const size = 20 * (1 + Math.max(0, 0.15 - t) * 3);
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.fillStyle = '#ff3b3b';
      const text = banners && killPop.streak >= 2 ? `KILL ×${killPop.streak}` : 'KILL';
      const y = mouse.y - 34 - t * 10;
      ctx.strokeText(text, mouse.x, y);
      ctx.fillText(text, mouse.x, y);
      ctx.globalAlpha = 1;
    }
  }

  return {
    update,
    drawWorld,
    drawScreen,
    drawHud,
    recoilOf: (s) => recoil.get(s) ?? 0,
    get offset() { return offset; },
    setBanners(onOff) { banners = onOff; },
  };
}
