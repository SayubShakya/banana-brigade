// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { WEAPONS, SOLDIER, TILE, GRENADE, BOT_TACTICS } from './config.js';
import { hasLineOfSight, isSolid } from './map.js';
import { center, activeGun } from './world.js';

const rand = (a, b) => a + Math.random() * (b - a);
const leaveAlone = (world, s) => s.shieldTimer > 0 || s.busy || world.time < (s.graceUntil ?? 0);

function brainFor(bot, level) {
  if (!bot.brain) {
    bot.brain = {
      think: 0, target: null, seenFor: 0, waypoint: null, strafe: 1, strafeTimer: 0,
      jetHold: false, stuck: 0, lastX: bot.x, aimErr: { x: 0, y: 0 }, detour: 1, detourTime: 0, refuel: false, climbing: false,
      accuracy: rand(...level.accuracy),
      burst: rand(0, level.burst), firing: true,
      retreatUntil: 0, dodge: 0, dodgeDir: 1, seenHurt: bot.lastHurt, evade: null, cluster: 0,
    };
  }
  return bot.brain;
}

function nearestPickup(world, bot, kind) {
  let best = null;
  let bestD = Infinity;
  const c = center(bot);
  for (const p of world.pickups) {
    if (!p.active || p.kind !== kind) continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

function gapSide(map, bot, wp) {
  const y = bot.y - 8;
  const col = Math.floor((bot.x + bot.w / 2) / TILE);
  let left = Infinity;
  let right = Infinity;
  for (let i = 1; i <= 14; i++) {
    if (left === Infinity && !isSolid(map, (col - i) * TILE + TILE / 2, y) && !isSolid(map, (col - i) * TILE + TILE / 2, y + TILE)) left = i;
    if (right === Infinity && !isSolid(map, (col + i) * TILE + TILE / 2, y) && !isSolid(map, (col + i) * TILE + TILE / 2, y + TILE)) right = i;
  }
  if (left === right) return wp.x < bot.x ? -1 : 1;
  return left < right ? -1 : 1;
}

function blastThreat(world, bot, me) {
  for (const r of world.rockets) {
    if (r.owner === bot) continue;
    const ex = r.vx * 0.6, ey = r.vy * 0.6;
    const t = Math.max(0, Math.min(1, ((me.x - r.x) * ex + (me.y - r.y) * ey) / (ex * ex + ey * ey || 1)));
    const px = r.x + ex * t, py = r.y + ey * t;
    if (Math.hypot(px - me.x, py - me.y) < r.blastRadius) return { x: px, y: py, horizontal: Math.abs(r.vx) > Math.abs(r.vy) };
  }
  for (const g of world.grenades) {
    if (g.fuse < 1.5 && Math.hypot(g.x - me.x, g.y - me.y) < GRENADE.blastRadius + 20) return { x: g.x, y: g.y, horizontal: false };
  }
  return null;
}

function think(world, bot, b, level) {
  const me = center(bot);
  const enemies = world.soldiers.filter((s) => s !== bot && s.alive && !leaveAlone(world, s) && s.team !== bot.team);

  let target = null;
  let bestScore = Infinity;
  for (const e of enemies) {
    const ec = center(e);
    const d = Math.hypot(ec.x - me.x, ec.y - me.y);
    const visible = d < 1400 && hasLineOfSight(world.map, me, ec);
    const chasers = world.soldiers.filter((o) => o !== bot && o.alive && o.brain?.target?.soldier === e).length;
    const score = d + (visible ? 0 : 900) + chasers * BOT_TACTICS.spreadPenalty * level.smarts;
    if (score < bestScore) { bestScore = score; target = { soldier: e, visible, d }; }
  }
  if (target?.soldier !== b.target?.soldier) b.seenFor = 0;
  b.target = target;

  b.cluster = 0;
  if (target) {
    const tc = center(target.soldier);
    b.cluster = enemies.filter((e) => e !== target.soldier && Math.hypot(center(e).x - tc.x, center(e).y - tc.y) < BOT_TACTICS.clusterRadius).length;
  }

  if (!b.evade || world.time > b.evade.until) {
    b.evade = null;
    const threat = blastThreat(world, bot, me);
    if (threat && Math.random() < level.smarts + 0.15) {
      b.evade = { dir: Math.sign(me.x - threat.x) || (Math.random() < 0.5 ? -1 : 1), jet: threat.horizontal, until: world.time + BOT_TACTICS.evadeTime };
    }
  }

  if (bot.health < BOT_TACTICS.retreatHealth && target?.visible && world.time > b.retreatUntil && Math.random() < level.smarts) {
    b.retreatUntil = world.time + BOT_TACTICS.retreatTime;
  }
  const retreating = world.time < b.retreatUntil && bot.health < BOT_TACTICS.retreatHealth + 15;

  const hurt = bot.health < 40 || retreating ? nearestPickup(world, bot, 'health') : null;
  const crate = !bot.primary ? nearestPickup(world, bot, 'weapon') : null;
  if (hurt) b.waypoint = { x: hurt.x, y: hurt.y };
  else if (retreating && target) {
    const tc = center(target.soldier);
    const away = Math.sign(me.x - tc.x) || 1;
    b.waypoint = { x: me.x + away * 450, y: me.y - 40 };
  }
  else if (crate && !(target && target.visible && target.d < 450)) b.waypoint = { x: crate.x, y: crate.y };
  else if (target && target.visible) {
    const gun = WEAPONS[activeGun(bot).key];
    const ideal = gun.range < 300 ? 120 : gun.range < 500 ? 180 : 380;
    const tc = center(target.soldier);
    const away = Math.sign(me.x - tc.x) || 1;
    b.waypoint = { x: tc.x + away * ideal + b.strafe * 60, y: tc.y - 40 };
  } else if (target) {
    b.waypoint = center(target.soldier);
  } else if (!b.waypoint || Math.random() < 0.02) {
    const p = world.map.spawns[Math.floor(Math.random() * world.map.spawns.length)];
    b.waypoint = { x: p.x, y: p.y };
  }

  const accuracy = Math.min(0.95, b.accuracy + (world.rampBonus ?? 0));
  const spread = (1.2 - accuracy) * (target ? Math.min(300, target.d * 0.26) : 0);
  b.aimErr = { x: rand(-spread, spread), y: rand(-spread, spread) };
}

export function updateBots(world, dt) {
  for (const bot of world.soldiers) {
    if (bot.isPlayer || bot.isDummy || !bot.alive) continue;
    const level = world.difficulty;
    const b = brainFor(bot, level);
    const c = bot.controls;
    const me = center(bot);

    b.think -= dt;
    if (b.think <= 0) { b.think = rand(0.12, 0.22); think(world, bot, b, level); }

    if (bot.lastHurt > b.seenHurt) {
      b.seenHurt = bot.lastHurt;
      if (b.dodge <= 0 && Math.random() < level.smarts * 0.8) { b.dodge = BOT_TACTICS.dodgeTime; b.dodgeDir = Math.random() < 0.5 ? -1 : 1; }
    }
    b.dodge = Math.max(0, b.dodge - dt);
    b.strafeTimer -= dt;
    if (b.strafeTimer <= 0) { b.strafeTimer = rand(0.6, 1.6); b.strafe = Math.random() < 0.5 ? -1 : 1; }

    const wp = b.waypoint ?? me;
    const dx = wp.x - me.x;
    c.left = dx < -24;
    c.right = dx > 24;

    const climbNeeded = wp.y < bot.y - 60;
    const roofAbove = (rows) => {
      for (let i = 1; i <= rows; i++) {
        const y = bot.y - i * TILE + TILE / 2;
        if (isSolid(world.map, bot.x + 2, y) || isSolid(world.map, bot.x + bot.w - 2, y)) return true;
      }
      return false;
    };
    const visible = b.target?.visible;
    if (!visible && climbNeeded && bot.onGround && bot.fuel < 55) b.refuel = true;
    if (b.refuel && (bot.fuel >= 95 || visible)) b.refuel = false;

    if (b.refuel) {
      c.left = c.right = false;
    } else if (!visible && climbNeeded && roofAbove(3)) {
      if (b.detourTime <= 0) { b.detour = gapSide(world.map, bot, wp); b.detourTime = 2.5; }
      b.detourTime -= dt;
      c.left = b.detour < 0;
      c.right = b.detour > 0;
      b.climbing = true;
    } else if (b.climbing && climbNeeded && !visible) {
      c.left = c.right = false;
    } else {
      b.climbing = false;
      b.detourTime = 0;
    }
    const evading = b.evade && world.time <= b.evade.until;
    if (evading || b.dodge > 0) {
      const d = evading ? b.evade.dir : b.dodgeDir;
      c.left = d < 0;
      c.right = d > 0;
    }
    const dir = c.right ? 1 : c.left ? -1 : 0;

    const wallAhead = dir !== 0 && (isSolid(world.map, me.x + dir * 26, bot.y + bot.h - 8) || isSolid(world.map, me.x + dir * 26, bot.y + 10));
    const wantUp = !b.refuel && (wp.y < bot.y - 30 || wallAhead || b.stuck > 0.5 || (!bot.onGround && bot.vy > 650));
    if (bot.fuel < 4) b.jetHold = false;
    else if (wantUp && (bot.fuel > 25 || !bot.onGround)) b.jetHold = true;
    else if (!wantUp) b.jetHold = false;
    c.jet = b.jetHold && !(b.climbing && roofAbove(1));
    if (((evading && b.evade.jet) || b.dodge > 0) && bot.fuel > 10 && !roofAbove(1)) c.jet = true;

    if (dir !== 0 && Math.abs(bot.x - b.lastX) < 0.5) b.stuck += dt; else b.stuck = Math.max(0, b.stuck - dt * 2);
    b.lastX = bot.x;

    const t = b.target;
    if (t && t.soldier.alive && !t.soldier.busy) {
      const tc = center(t.soldier);
      const lead = Math.min(0.25, t.d / 1600);
      c.aimX = tc.x + t.soldier.vx * lead + b.aimErr.x;
      c.aimY = tc.y - 6 + t.soldier.vy * lead * 0.5 + b.aimErr.y;
      const gun = activeGun(bot);
      const w = WEAPONS[gun.key];
      if (t.visible) b.seenFor += dt; else b.seenFor = 0;
      const inRange = t.d < w.range * 0.9;
      b.burst -= dt;
      if (b.burst <= 0) { b.firing = !b.firing; b.burst = b.firing ? rand(0.5, 1) * level.burst : rand(0.6, 1.4) * level.pause; }
      c.fire = t.visible && inRange && b.seenFor > level.reaction && (b.firing || level.pause === 0);
      if (t.visible && t.d < SOLDIER.meleeRange + 10) c.melee = true;
      const grenadeRate = level.grenades * (b.cluster > 0 ? 1 + 5 * level.smarts : 1);
      if (t.visible && t.d > 220 && t.d < (b.cluster > 0 ? 620 : 520) && bot.grenades > 0 && Math.random() < dt * grenadeRate) c.grenade = true;
      if (!t.visible && gun.ammo < WEAPONS[gun.key].mag * 0.4) c.reload = true;
      if (bot.primary && bot.current === 'sidearm' && bot.primary.ammo + bot.primary.spare > 0) c.swap = true;
    } else {
      c.fire = false;
      c.aimX = me.x + (dir || bot.facing) * 200;
      c.aimY = me.y;
    }
  }
}
