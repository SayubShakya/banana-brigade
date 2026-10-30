// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { VIEW } from './config.js';
import { hasLineOfSight, KIND } from './map.js';
import { on } from '../services/eventBus.js';

export const MINIMAP = { width: 200, height: 80, margin: 16, gap: 10, narrow: 700, fallbackTop: 112, radius: 8 };
export const FIRE_MEMORY = 2;
const TILE_PX = 3;
const FADE_IN = 5;
const FADE_OUT = 2;
const RIPPLE_LIFE = 0.9;
const MEASURE_EVERY = 0.5;
const TERRAIN = { [KIND.ground]: 'rgba(196,184,140,0.9)', [KIND.platform]: 'rgba(255,214,102,0.95)', [KIND.block]: 'rgba(160,166,170,0.95)' };
const PICKUP = { banana: '#ffe135', weapon: '#b8bec4', health: '#7ddf64' };

const eye = (s) => ({ x: s.x + s.w / 2, y: s.y + 20 });

export function isHostile(me, other) {
  return !!me && !!other && other !== me && other.team !== me.team;
}

export function enemyVisible(map, me, enemy, now, lastFired) {
  if (!enemy?.alive || !me) return false;
  if (lastFired !== undefined && now - lastFired <= FIRE_MEMORY) return true;
  return hasLineOfSight(map, eye(me), eye(enemy));
}

export function minimapRect(anchorBottom, viewWidth = VIEW.width) {
  return { x: MINIMAP.margin, y: Math.min(anchorBottom + MINIMAP.gap, VIEW.height * 0.6), w: Math.min(MINIMAP.width, viewWidth * 0.3), h: MINIMAP.height };
}

function renderTerrain(map) {
  const c = document.createElement('canvas');
  c.width = map.cols * TILE_PX;
  c.height = map.rows * TILE_PX;
  const g = c.getContext('2d');
  for (let r = 0; r < map.rows; r++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.grid[r][col] !== 1) continue;
      g.fillStyle = TERRAIN[map.kinds?.[r]?.[col]] ?? TERRAIN[KIND.ground];
      g.fillRect(col * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX);
    }
  }
  return c;
}

export function createMinimap({ calm = () => false, canvas = null } = {}) {
  let terrainFor = null;
  let terrain = null;
  let userChoice = null;
  let clock = 0;
  let measuredAt = -99;
  let anchorBottom = MINIMAP.fallbackTop;
  let narrow = false;
  const lastFired = new Map();
  const alpha = new Map();
  const ripples = [];

  on('weapon:fired', ({ soldier }) => { if (soldier) lastFired.set(soldier, clock); });
  on('soldier:killed', ({ victim }) => {
    if (victim) ripples.push({ x: victim.x + victim.w / 2, y: victim.y + victim.h / 2, age: 0, victim });
  });
  on('match:started', () => { lastFired.clear(); alpha.clear(); ripples.length = 0; });

  function measure() {
    measuredAt = clock;
    const box = canvas?.getBoundingClientRect?.();
    if (!box || !box.width) return;
    narrow = box.width < MINIMAP.narrow;
    const panel = document.querySelector('#hud .hud-player');
    const r = panel?.getBoundingClientRect();
    if (r && r.height) anchorBottom = ((r.bottom - box.top) / box.height) * VIEW.height;
  }

  const visible = () => (userChoice ?? !narrow);

  function draw(ctx, world, view, dt) {
    clock += dt;
    if (clock - measuredAt > MEASURE_EVERY || measuredAt > clock) measure();
    const me = world.player;
    const map = world.map;
    const seen = new Set();
    for (const s of world.soldiers) {
      if (!isHostile(me, s)) continue;
      const inSight = enemyVisible(map, me, s, clock, lastFired.get(s));
      const a = alpha.get(s) ?? 0;
      alpha.set(s, inSight ? Math.min(1, a + dt * FADE_IN) : Math.max(0, a - dt * FADE_OUT));
      seen.add(s);
    }
    for (const s of alpha.keys()) if (!seen.has(s)) alpha.delete(s);
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt;
      if (ripples[i].age > RIPPLE_LIFE) ripples.splice(i, 1);
    }
    if (!visible()) return;

    if (terrainFor !== map) { terrain = renderTerrain(map); terrainFor = map; }
    const rect = minimapRect(anchorBottom);
    const sx = rect.w / map.width;
    const sy = rect.h / map.height;
    const toX = (wx) => rect.x + wx * sx;
    const toY = (wy) => rect.y + wy * sy;
    const quiet = calm();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.w, rect.h, MINIMAP.radius);
    ctx.fillStyle = 'rgba(12,16,8,0.68)';
    ctx.fill();
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(terrain, rect.x, rect.y, rect.w, rect.h);

    for (const p of world.pickups ?? []) {
      if (!p.active || !PICKUP[p.kind]) continue;
      ctx.fillStyle = PICKUP[p.kind];
      const size = p.kind === 'banana' ? 4 : 3;
      ctx.fillRect(toX(p.x) - size / 2, toY(p.y) - size / 2, size, size);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(toX(view.x) + 0.5, toY(view.y) + 0.5, view.w * sx, view.h * sy);

    if (!quiet) {
      for (const r of ripples) {
        const t = r.age / RIPPLE_LIFE;
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = r.victim === me ? '#ffe135' : isHostile(me, r.victim) ? '#ff4d4d' : '#5aa9ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(toX(r.x), toY(r.y), 2 + t * 11, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    for (const s of world.soldiers) {
      if (s === me || !s.alive) continue;
      const x = toX(s.x + s.w / 2);
      const y = toY(s.y + s.h / 2);
      if (!isHostile(me, s)) {
        ctx.fillStyle = '#5aa9ff';
        ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      const a = alpha.get(s) ?? 0;
      if (a <= 0.01) continue;
      const pulse = quiet ? 0 : (Math.sin(clock * 6 + x) + 1) / 2;
      ctx.globalAlpha = a * (0.25 + 0.25 * pulse);
      ctx.fillStyle = '#ff4d4d';
      ctx.beginPath(); ctx.arc(x, y, 4 + pulse * 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (me) {
      const angle = me.aim ?? (me.facing < 0 ? Math.PI : 0);
      ctx.translate(toX(me.x + me.w / 2), toY(me.y + me.h / 2));
      ctx.rotate(angle);
      ctx.fillStyle = me.alive ? '#ffe135' : 'rgba(255,225,53,0.4)';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,225,53,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, MINIMAP.radius); ctx.stroke();
    ctx.font = '700 9px Rubik, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('M', rect.x + rect.w - 5, rect.y + rect.h - 5);
  }

  return {
    draw,
    toggle() { userChoice = !visible(); return userChoice; },
    get visible() { return visible(); },
  };
}
