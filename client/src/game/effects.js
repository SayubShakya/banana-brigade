// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../services/eventBus.js';
import { VIEW, WEAPONS, TILE } from './config.js';
import { raycast, isSolid } from './map.js';
import { drawSoldier } from './characters.js';

const KICK = { magnum: 5, smg: 2.5, rifle: 3.5, shotgun: 9, sniper: 12, rocket: 10, flamer: 0 };
const CAM_KICK = { magnum: 2, smg: 1, rifle: 1.5, shotgun: 5, sniper: 7, rocket: 6, flamer: 0 };
const FLASH_LIFE = { magnum: 0.06, smg: 0.04, rifle: 0.05, shotgun: 0.08, sniper: 0.1, rocket: 0.09 };
const GRAVITY = 1400;
const BANANA = '#ffe135';
const GOLD = '#ffc300';

const POSE = { melee: 0.32, throw: 0.4, swap: 0.35, land: 0.28, flinch: 0.18 };
const CORPSE_LIFE = 2.2;
const NO_MAG = new Set(['rocket', 'flamer']);

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

export function createEffects(view) {
  let world = null;

  const flashes = makePool(24, () => ({ soldier: null, kind: 'magnum', age: 0, life: 0.05 }));
  const beams = makePool(8, () => ({ x1: 0, y1: 0, x2: 0, y2: 0, age: 0, life: 0.35 }));
  const impacts = makePool(32, () => ({ x: 0, y: 0, delay: 0, age: 0 }));
  const sparks = makePool(96, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0.3, size: 2, color: '#fff' }));
  const shells = makePool(24, () => ({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, age: 0, life: 0.7, color: '#d4a017', w: 6, h: 3 }));
  const numbers = makePool(24, () => ({ victim: null, x: 0, y: 0, value: 0, age: 0, life: 0.9, mine: false, headshot: false }));
  const arrows = makePool(4, () => ({ ax: 0, ay: 0, age: 0, life: 1.1 }));
  const corpses = makePool(10, () => ({ x: 0, y: 0, w: 28, h: 50, vx: 0, vy: 0, rot: 0, vr: 0, bounces: 0, resting: false, floor: 0, age: 0, avatar: null, facing: 1, aim: 0, weapon: 'magnum' }));
  const spawnRings = makePool(6, () => ({ soldier: null, age: 0, life: 0.8 }));
  const smoke = makePool(80, () => ({ x: 0, y: 0, vx: 0, vy: 0, r: 3, grow: 10, age: 0, life: 0.5, alpha: 0.4, color: '#999' }));
  const fireballs = makePool(6, () => ({ x: 0, y: 0, radius: 60, age: 0, life: 0.4 }));
  const shockwaves = makePool(6, () => ({ x: 0, y: 0, radius: 60, age: 0, life: 0.35 }));
  const debris = makePool(40, () => ({ x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, size: 4, color: '#555', age: 0, life: 1.4 }));
  const scorches = makePool(8, () => ({ x: 0, y: 0, r: 40, age: 0, life: 8 }));
  const recoil = new Map();
  const anims = new Map();
  const marker = { age: 9, life: 0.25, kill: false, headshot: false };
  const killPop = { age: 9, life: 0.9, streak: 0 };
  const headPop = { age: 9, life: 0.8, kill: false };
  const banner = { age: 9, life: 1.6, text: '' };
  const kick = { x: 0, y: 0 };
  let shake = 0;
  let streak = 0;
  let quickKills = 0;
  let lastKillAt = -99;
  let clock = 0;
  let banners = true;
  let vignette = null;
  const offset = { x: 0, y: 0 };

  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => reduced?.matches || document.body.classList.contains('a11y-calm');

  function reset() {
    for (const p of [flashes, beams, impacts, sparks, shells, numbers, arrows, corpses, spawnRings, smoke, fireballs, shockwaves, debris, scorches]) p.clear();
    recoil.clear();
    anims.clear();
    marker.age = killPop.age = headPop.age = banner.age = 9;
    kick.x = kick.y = shake = 0;
    streak = quickKills = 0;
    lastKillAt = -99;
  }

  function animOf(s) {
    let a = anims.get(s);
    if (!a) {
      a = { melee: 9, throwT: 9, swap: 9, land: 9, landAmp: 0, flinch: 9, flinchDir: 0, lean: 0, prevX: null, current: s.current, jet: 0 };
      anims.set(s, a);
    }
    return a;
  }

  function puff(x, y, vx, vy, r, grow, life, alpha, color) {
    const p = smoke.spawn();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.r = r; p.grow = grow; p.life = life; p.alpha = alpha; p.color = color;
  }

  const isMe = (s) => !!s && !!world && s === world.player;

  function addShake(amount) { if (!calm()) shake = Math.min(14, Math.max(shake, amount)); }

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

  on('melee:swing', ({ soldier }) => { if (soldier) animOf(soldier).melee = 0; });
  on('grenade:thrown', ({ soldier }) => { if (soldier) animOf(soldier).throwT = 0; });

  on('weapon:reloading', ({ soldier, weapon }) => {
    if (!world || !soldier || NO_MAG.has(weapon)) return;
    const m = shells.spawn();
    m.x = soldier.x + soldier.w / 2 + Math.cos(soldier.aim) * 12; m.y = soldier.y + 30;
    m.vx = rand(-30, 30); m.vy = rand(-90, -40);
    m.rot = 0; m.vr = rand(-6, 6); m.life = 0.8;
    m.w = 4; m.h = 8; m.color = '#2b2b2b';
  });

  on('soldier:respawned', ({ soldier }) => {
    if (!world || !soldier) return;
    const r = spawnRings.spawn();
    r.soldier = soldier; r.life = 0.8;
    animOf(soldier).current = soldier.current;
    if (calm()) return;
    for (let i = 0; i < 12; i++) {
      const s = sparks.spawn();
      const a = (i / 12) * Math.PI * 2;
      s.x = soldier.x + soldier.w / 2 + Math.cos(a) * 18; s.y = soldier.y + soldier.h / 2 + Math.sin(a) * 24;
      s.vx = Math.cos(a) * rand(60, 140); s.vy = Math.sin(a) * rand(60, 140) - 220;
      s.life = rand(0.35, 0.6); s.size = i % 3 ? 3 : 5; s.color = i % 2 ? BANANA : '#fff6a8';
    }
  });

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

    const sh = shells.spawn();
    const back = Math.cos(soldier.aim) >= 0 ? -1 : 1;
    sh.x = soldier.x + soldier.w / 2; sh.y = soldier.y + 24;
    sh.vx = back * rand(80, 180); sh.vy = rand(-320, -200);
    sh.rot = 0; sh.vr = rand(-20, 20); sh.life = 0.7;
    sh.w = 6; sh.h = 3;
    sh.color = weapon === 'shotgun' ? '#c0392b' : '#d4a017';
  });

  on('soldier:damaged', ({ victim, attacker, amount, headshot }) => {
    if (!world || !victim) return;
    if (amount > 0) {
      const a = animOf(victim);
      a.flinch = 0;
      a.flinchDir = attacker && attacker !== victim ? Math.sign(attacker.x - victim.x) || 1 : 0;
      let n = null;
      for (const it of numbers.items) if (it.active && it.victim === victim && it.age < 0.15) { n = it; break; }
      if (n) n.value += amount;
      else {
        n = numbers.spawn();
        n.victim = victim; n.value = amount; n.life = 0.9;
        n.x = victim.x + victim.w / 2 + rand(-10, 10); n.y = victim.y - 30;
      }
      n.mine = isMe(attacker) || isMe(victim);
      n.headshot = !!headshot || (n.headshot && n.age < 0.15);
    }
    if (isMe(attacker) && victim !== attacker) {
      marker.age = 0; marker.life = headshot ? 0.35 : 0.25; marker.kill = false; marker.headshot = !!headshot;
      if (headshot) { headPop.age = 0; headPop.kill = false; }
    }
    if (isMe(victim)) {
      if (amount >= 20) addShake(Math.min(10, amount * 0.2));
      if (attacker && attacker !== victim && !view.onScreen(attacker.x + attacker.w / 2, attacker.y + attacker.h / 2)) {
        const a = arrows.spawn();
        a.ax = attacker.x + attacker.w / 2; a.ay = attacker.y + attacker.h / 2; a.life = 1.1;
      }
    }
  });

  on('soldier:killed', ({ victim, killer, headshot }) => {
    if (!world) return;
    if (victim) spawnCorpse(victim, killer, headshot);
    if (isMe(victim)) { streak = 0; quickKills = 0; }
    if (isMe(killer) && victim !== killer) {
      streak += 1;
      marker.age = 0; marker.life = 0.45; marker.kill = true; marker.headshot = !!headshot;
      killPop.age = 0; killPop.streak = streak;
      if (headshot) { headPop.age = 0; headPop.kill = true; }
      quickKills = clock - lastKillAt < 4 ? quickKills + 1 : 1;
      lastKillAt = clock;
      const text = quickKills >= 4 || streak % 5 === 0 ? 'RAMPAGE!' : quickKills === 3 ? 'TRIPLE KILL' : quickKills === 2 ? 'DOUBLE KILL' : '';
      if (text && banners) { banner.text = text; banner.age = 0; }
    }
  });

  function spawnCorpse(victim, killer, headshot) {
    const c = corpses.spawn();
    c.x = victim.x + victim.w / 2; c.y = victim.y + victim.h / 2;
    c.w = victim.w; c.h = victim.h;
    c.avatar = victim.avatar; c.facing = victim.facing || 1; c.aim = victim.aim ?? 0;
    c.weapon = (victim.current === 'primary' ? victim.primary?.key : victim.sidearm?.key) ?? 'magnum';
    const power = headshot ? 480 : 320;
    let dx = 0, dy = -1;
    if (killer && killer !== victim) {
      dx = c.x - (killer.x + killer.w / 2); dy = c.y - (killer.y + killer.h / 2);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
    }
    c.vx = dx * power + (dx === 0 ? -c.facing * 60 : 0);
    c.vy = Math.min(dy * power, 0) - 340;
    const spin = Math.sign(c.vx || -c.facing) * rand(5, 8) * (headshot ? 1.4 : 1);
    c.vr = calm() ? spin * 0.4 : spin;
    c.rot = 0; c.bounces = 0; c.resting = false;
  }

  const halfHeight = (c) => Math.abs(Math.cos(c.rot)) * c.h / 2 + Math.abs(Math.sin(c.rot)) * c.w / 2;

  function updateCorpse(c, dt) {
    if ((c.age += dt) > CORPSE_LIFE) { c.active = false; return; }
    if (c.resting) {
      const flat = (Math.sign(c.rot) || 1) * Math.PI / 2;
      c.rot += (flat - c.rot) * Math.min(1, dt * 10);
      c.y = c.floor - halfHeight(c);
      return;
    }
    const map = world.map;
    c.vy += GRAVITY * dt;
    c.rot += c.vr * dt;
    const half = halfHeight(c);
    const nx = c.x + c.vx * dt;
    if (isSolid(map, nx + Math.sign(c.vx) * 13, c.y)) c.vx = -c.vx * 0.3;
    else c.x = nx;
    const ny = c.y + c.vy * dt;
    if (c.vy > 0 && isSolid(map, c.x, ny + half)) {
      c.floor = Math.floor((ny + half) / TILE) * TILE;
      c.y = c.floor - half;
      c.bounces += 1;
      if (c.bounces >= 3 || c.vy < 160) {
        c.resting = true; c.vx = c.vy = c.vr = 0;
        c.rot = Math.atan2(Math.sin(c.rot), Math.cos(c.rot));
        return;
      }
      c.vy = -c.vy * 0.38; c.vx *= 0.55; c.vr *= 0.5;
    } else if (c.vy < 0 && isSolid(map, c.x, ny - half)) {
      c.vy = -c.vy * 0.3;
    } else c.y = ny;
  }

  on('soldier:landed', ({ soldier, speed, x, y }) => {
    if (soldier && speed > 200) {
      const a = animOf(soldier);
      a.land = 0;
      a.landAmp = Math.min(0.24, (speed - 200) / 1600 + 0.06) * (calm() ? 0.5 : 1);
    }
    if (!(speed >= 260) || x === undefined) return;
    const n = Math.min(8, Math.round(speed / 120));
    for (let i = 0; i < n; i++) {
      const s = sparks.spawn();
      s.x = x + rand(-10, 10); s.y = y - 2; s.vx = rand(-140, 140); s.vy = rand(-90, -20);
      s.life = rand(0.3, 0.5); s.size = 4; s.color = 'rgba(170,150,120,0.6)';
    }
  });

  on('explosion', ({ x, y, radius }) => {
    if (!world) return;
    const quiet = calm();
    const fb = fireballs.spawn();
    fb.x = x; fb.y = y; fb.radius = radius * 0.55; fb.life = quiet ? 0.3 : 0.4;
    if (!quiet) { const sw = shockwaves.spawn(); sw.x = x; sw.y = y; sw.radius = radius * 1.3; sw.life = 0.35; }
    for (let i = 0; i < 5; i++) {
      const a = rand(0, Math.PI * 2);
      puff(x + Math.cos(a) * radius * 0.2, y + Math.sin(a) * radius * 0.2, Math.cos(a) * 30, rand(-60, -20),
        radius * 0.18, radius * 0.3, rand(0.9, 1.4), 0.55, i % 2 ? '#4a4a4a' : '#6b6b6b');
    }
    const ground = world.map.theme?.ground?.body ?? '#6b4f2a';
    for (let i = 0; i < 9; i++) {
      const d = debris.spawn();
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(220, 480);
      d.x = x; d.y = y - 4; d.vx = Math.cos(a) * sp; d.vy = Math.sin(a) * sp;
      d.rot = rand(0, 6); d.vr = rand(-12, 12); d.size = rand(3, 7); d.life = rand(1.0, 1.6);
      d.color = i % 3 ? ground : '#2b2118';
    }
    for (let py = y; py < y + radius; py += 4) {
      if (!isSolid(world.map, x, py)) continue;
      const sc = scorches.spawn();
      sc.x = x; sc.y = Math.floor(py / TILE) * TILE; sc.r = radius * 0.5; sc.life = 8;
      break;
    }
    if (!world.player) return;
    const p = world.player;
    const d = Math.hypot(p.x + p.w / 2 - x, p.y + p.h / 2 - y);
    const reach = radius * 3;
    if (d < reach) addShake(12 * (1 - d / reach) + 2);
  });

  function update(w, dt) {
    if (w !== world) { world = w; reset(); }
    clock += dt;
    updateSoldiers(dt);
    for (const c of corpses.items) if (c.active) updateCorpse(c, dt);
    for (const r of spawnRings.items) if (r.active && (r.age += dt) > r.life) r.active = false;
    for (const f of fireballs.items) if (f.active && (f.age += dt) > f.life) f.active = false;
    for (const sw of shockwaves.items) if (sw.active && (sw.age += dt) > sw.life) sw.active = false;
    for (const sc of scorches.items) if (sc.active && (sc.age += dt) > sc.life) sc.active = false;
    for (const p of smoke.items) {
      if (!p.active) continue;
      if ((p.age += dt) > p.life) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.grow * dt;
      p.vx *= 1 - Math.min(1, dt * 2); p.vy -= 30 * dt;
    }
    for (const d of debris.items) {
      if (!d.active) continue;
      if ((d.age += dt) > d.life) { d.active = false; continue; }
      d.vy += GRAVITY * dt; d.rot += d.vr * dt;
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
      if (!isSolid(world.map, nx, ny)) { d.x = nx; d.y = ny; continue; }
      if (isSolid(world.map, nx, d.y)) d.vx = -d.vx * 0.4;
      else { d.vy = -d.vy * 0.4; d.vx *= 0.7; d.vr *= 0.6; }
    }
    headPop.age += dt;
    banner.age += dt;
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
        s.color = i < 3 ? '#fff3b0' : 'rgba(160,130,100,0.7)';
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

    const k = Math.min(1, dt * 12);
    kick.x -= kick.x * k; kick.y -= kick.y * k;
    shake = Math.max(0, shake - shake * Math.min(1, dt * 7) - dt * 2);
    offset.x = kick.x + (shake ? rand(-shake, shake) : 0);
    offset.y = kick.y + (shake ? rand(-shake, shake) : 0);
  }

  function updateSoldiers(dt) {
    for (const s of world.soldiers) {
      const a = animOf(s);
      a.melee += dt; a.throwT += dt; a.swap += dt; a.land += dt; a.flinch += dt;
      if (s.current !== a.current) { if (s.alive && a.current !== undefined) a.swap = 0; a.current = s.current; }
      let target = 0;
      if (s.alive && a.prevX !== null && dt > 0) {
        const vx = Math.max(-1, Math.min(1, (s.x - a.prevX) / dt / 320));
        target = vx * (s.jetting ? 0.16 : s.onGround ? 0.08 : 0.11);
      }
      a.prevX = s.x;
      a.lean += (target - a.lean) * Math.min(1, dt * 10);
      if (s.alive && s.jetting && (a.jet -= dt) <= 0) {
        a.jet = 0.05;
        const f = s.facing || 1;
        puff(s.x + s.w / 2 - f * 12 + rand(-2, 2), s.y + 46, rand(-20, 20), rand(40, 90), 3.5, 16, rand(0.45, 0.65), 0.5, '#9b9b9b');
      }
    }
  }

  function applyPose(s, v) {
    const a = anims.get(s);
    v.lean = 0; v.squash = 0; v.gunTilt = 0; v.swing = 0; v.throwArm = 0;
    if (!a) return v;
    v.lean = a.lean;
    if (a.flinch < POSE.flinch && a.flinchDir && !calm()) v.lean -= a.flinchDir * 0.14 * (1 - a.flinch / POSE.flinch);
    if (a.land < POSE.land) v.squash = a.landAmp * (1 - a.land / POSE.land) ** 2;
    if (a.melee < POSE.melee) v.swing = a.melee / POSE.melee;
    if (a.throwT < POSE.throw) v.throwArm = a.throwT / POSE.throw;
    const len = WEAPONS[v.weapon]?.reload;
    if (s.reloadTimer > 0 && len) {
      const p = Math.max(0, Math.min(1, 1 - s.reloadTimer / len));
      v.gunTilt = 0.7 * Math.min(1, Math.sin(p * Math.PI) * 2.5);
    }
    if (a.swap < POSE.swap) v.gunTilt = Math.max(v.gunTilt, 1.1 * Math.sin((a.swap / POSE.swap) * Math.PI));
    return v;
  }

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
      ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
      ctx.restore();
    }
    for (const d of debris.items) {
      if (!d.active) continue;
      ctx.globalAlpha = Math.min(1, (d.life - d.age) * 3);
      ctx.save();
      ctx.translate(d.x - cam.x, d.y - cam.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.8);
      ctx.restore();
    }
    for (const p of smoke.items) {
      if (!p.active) continue;
      ctx.globalAlpha = p.alpha * (1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    for (const f of fireballs.items) {
      if (!f.active) continue;
      const t = f.age / f.life;
      const r = f.radius * (0.55 + 0.45 * Math.sqrt(t));
      const x = f.x - cam.x, y = f.y - cam.y;
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.fillStyle = '#ff6b1a';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffbe0b';
      ctx.beginPath(); ctx.arc(x, y - r * 0.08, r * 0.68, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = calm() ? 0.5 * (1 - t) : 1 - t;
      ctx.fillStyle = '#fff6d0';
      ctx.beginPath(); ctx.arc(x, y - r * 0.12, r * 0.36 * (1 - t), 0, Math.PI * 2); ctx.fill();
    }
    for (const sw of shockwaves.items) {
      if (!sw.active) continue;
      const t = sw.age / sw.life;
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(sw.x - cam.x, sw.y - cam.y, sw.radius * (0.2 + 0.8 * t), 0, Math.PI * 2); ctx.stroke();
    }
    for (const r of spawnRings.items) {
      if (!r.active || !r.soldier) continue;
      const t = r.age / r.life;
      const s = r.soldier;
      const x = s.x + s.w / 2 - cam.x, y = s.y + s.h / 2 - cam.y;
      const quiet = calm();
      ctx.globalAlpha = 0.35 * (1 - t);
      ctx.fillStyle = '#fff6a8';
      ctx.fillRect(x - 16 * (1 - t * 0.5), y - 70, 32 * (1 - t * 0.5), 100);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = BANANA;
      ctx.lineWidth = 5 * (1 - t) + 1;
      ctx.beginPath(); ctx.ellipse(x, y, quiet ? 30 : 12 + 34 * Math.sqrt(t), quiet ? 36 : 14 + 40 * Math.sqrt(t), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const corpseView = { x: 0, y: 0, w: 28, h: 50, facing: 1, aim: 0, walkPhase: 0, onGround: false, jetting: false, weapon: 'magnum', hurtFlash: 0, shielded: false, recoil: 0 };

  function drawUnder(ctx, cam, time) {
    for (const sc of scorches.items) {
      if (!sc.active) continue;
      ctx.globalAlpha = 0.5 * Math.min(1, (sc.life - sc.age) / 2);
      ctx.fillStyle = '#1a140e';
      ctx.beginPath(); ctx.ellipse(sc.x - cam.x, sc.y - cam.y + 2, sc.r, sc.r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const c of corpses.items) {
      if (!c.active || !c.avatar) continue;
      ctx.save();
      ctx.globalAlpha = c.age > CORPSE_LIFE - 0.5 ? (CORPSE_LIFE - c.age) / 0.5 : 1;
      ctx.translate(c.x - cam.x, c.y - cam.y);
      ctx.rotate(c.rot);
      corpseView.w = c.w; corpseView.h = c.h; corpseView.x = -c.w / 2; corpseView.y = -c.h / 2;
      corpseView.facing = c.facing; corpseView.aim = c.aim; corpseView.weapon = c.weapon;
      corpseView.hurtFlash = c.age < 0.15 ? 1 : 0;
      drawSoldier(ctx, corpseView, c.avatar, time);
      ctx.restore();
    }
  }

  function drawScreen(ctx) {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const n of numbers.items) {
      if (!n.active) continue;
      const t = n.age / n.life;
      const v = view.toViewFromWorld(n.x, n.y - t * 40);
      ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      ctx.font = `bold ${n.mine ? (n.headshot ? 22 : 18) : 14}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = n.headshot && !isMe(n.victim) ? GOLD : n.mine ? (isMe(n.victim) ? '#ff6b6b' : '#ffe135') : '#ffffff';
      const text = String(Math.round(n.value));
      ctx.strokeText(text, v.x, v.y);
      ctx.fillText(text, v.x, v.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawHud(ctx, mouse) {
    ctx.textAlign = 'center';
    const p = world?.player;
    if (p && p.alive && p.health < 30) {
      if (!vignette) {
        vignette = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.42, VIEW.width / 2, VIEW.height / 2, VIEW.width * 0.56);
        vignette.addColorStop(0, 'rgba(200,0,20,0)');
        vignette.addColorStop(1, 'rgba(200,0,20,0.9)');
      }
      const strength = 0.45 + 0.55 * (1 - Math.max(0, p.health) / 30);
      ctx.globalAlpha = strength * (calm() ? 0.8 : 0.65 + 0.35 * Math.sin(clock * 6));
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      ctx.globalAlpha = 1;
    }
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
      const outer = (marker.kill ? 18 : 13) + (marker.headshot ? 4 : 0) + t * 3;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = marker.headshot ? GOLD : marker.kill ? '#ff3b3b' : '#ffffff';
      ctx.lineWidth = marker.kill || marker.headshot ? 3 : 2;
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

    if (headPop.age < headPop.life) {
      const t = headPop.age / headPop.life;
      const base = headPop.kill ? 26 : 17;
      const size = calm() ? base : base * (1 + Math.max(0, 0.15 - t) * 3);
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = GOLD;
      const y = mouse.y - (headPop.kill ? 62 : 52) - t * 10;
      ctx.strokeText('HEADSHOT!', mouse.x, y);
      ctx.fillText('HEADSHOT!', mouse.x, y);
      ctx.globalAlpha = 1;
    }

    if (banner.age < banner.life && banners) {
      const t = banner.age / banner.life;
      const grow = calm() || t > 0.1 ? 1 : 1.7 - 0.7 * (t / 0.1);
      const rampage = banner.text === 'RAMPAGE!';
      ctx.save();
      ctx.translate(VIEW.width / 2, 150);
      ctx.scale(grow, grow);
      ctx.globalAlpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      ctx.font = `italic 900 ${rampage ? 50 : 42}px "Trebuchet MS", sans-serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(40,10,0,0.85)';
      ctx.fillStyle = rampage ? '#ff4d2e' : BANANA;
      ctx.strokeText(banner.text, 0, 0);
      ctx.fillText(banner.text, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  return {
    update,
    drawWorld,
    drawScreen,
    drawHud,
    drawUnder,
    applyPose,
    calm,
    recoilOf: (s) => recoil.get(s) ?? 0,
    get offset() { return offset; },
    setBanners(onOff) { banners = onOff; },
  };
}
