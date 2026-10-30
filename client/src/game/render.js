// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { VIEW, TILE, WEAPONS, SOLDIER, POWERS } from './config.js';

const LEAD = { distance: 60, rate: 4 };
export const ZOOM_SCALE = { normal: 1, scope: 1.6, far: 0.85 };
export const LOOK = { normal: 0.3, far: 0.35, scope: 0.55 };
export const SAFE_BOX = { left: 0.3, right: 0.62, top: 0.3, bottom: 0.6 };
export const HARD_BOX = { left: 0.12, right: 0.8, top: 0.12, bottom: 0.78 };
const ANCHOR = { x: 0.47, y: 0.45 };
const CAMERA_RATE = 8;
const TRACER_SPEED = 1500;
const REACH = { x: 26, y: 36 };
const NEEDS_KEY = new Set(['banana', 'weapon']);
const LOW_FUEL = 20;
import { drawSoldier, drawWeaponPickup } from './characters.js';
import { activeGun } from './world.js';
import { raycast, KIND } from './map.js';
import { createEffects } from './effects.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function playerScreenTarget({ mouse, lead, scale, look, view = VIEW }) {
  const sx = view.width * ANCHOR.x - (mouse.x - view.width / 2) * look - lead.x * scale;
  const sy = view.height * ANCHOR.y - (mouse.y - view.height / 2) * look - lead.y * scale;
  return {
    x: clamp(sx, view.width * SAFE_BOX.left, view.width * SAFE_BOX.right),
    y: clamp(sy, view.height * SAFE_BOX.top, view.height * SAFE_BOX.bottom),
  };
}

export function cameraTarget({ px, py, mouse, lead, scale, look, map, view = VIEW }) {
  const s = playerScreenTarget({ mouse, lead, scale, look, view });
  return {
    x: clamp(px - s.x / scale, 0, Math.max(0, map.width - view.width / scale)),
    y: clamp(py - s.y / scale, 0, Math.max(0, map.height - view.height / scale)),
  };
}

export function keepInBox(cam, px, py, scale, map, view = VIEW, box = HARD_BOX) {
  const x = clamp(cam.x, px - (view.width * box.right) / scale, px - (view.width * box.left) / scale);
  const y = clamp(cam.y, py - (view.height * box.bottom) / scale, py - (view.height * box.top) / scale);
  return {
    x: clamp(x, 0, Math.max(0, map.width - view.width / scale)),
    y: clamp(y, 0, Math.max(0, map.height - view.height / scale)),
  };
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0 };
  const lead = { x: 0, y: 0 };
  let dpr = 1;
  let scale = 1;
  let laser = true;
  const vw = () => VIEW.width / scale;
  const vh = () => VIEW.height / scale;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW.width * dpr;
    canvas.height = VIEW.height * dpr;
  }
  resize();
  window.addEventListener('resize', resize);

  function toView(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * VIEW.width, y: ((clientY - r.top) / r.height) * VIEW.height };
  }
  const toWorld = (vx, vy) => ({ x: vx / scale + cam.x, y: vy / scale + cam.y });
  const toViewFromWorld = (wx, wy) => ({ x: (wx - cam.x) * scale, y: (wy - cam.y) * scale });
  const onScreen = (wx, wy) => wx >= cam.x && wx <= cam.x + vw() && wy >= cam.y && wy <= cam.y + vh();
  const effects = createEffects({ toViewFromWorld, onScreen });
  let scopeT = 0;
  let scoped = false;
  let look = LOOK.normal;

  function updateCamera(world, mouse, dt) {
    const p = world.player;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    const k0 = Math.min(1, dt * LEAD.rate);
    const leadX = p.alive ? Math.cos(p.aim ?? 0) * LEAD.distance : 0;
    const leadY = p.alive ? Math.sin(p.aim ?? 0) * LEAD.distance * 0.6 : 0;
    lead.x += (leadX - lead.x) * k0;
    lead.y += (leadY - lead.y) * k0;
    const t = cameraTarget({ px, py, mouse, lead, scale, look, map: world.map });
    const k = Math.min(1, dt * CAMERA_RATE);
    cam.x += (t.x - cam.x) * k;
    cam.y += (t.y - cam.y) * k;
    Object.assign(cam, keepInBox(cam, px, py, scale, world.map));
  }

  const hash = (a, b = 0) => {
    let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };
  const tri = (t) => 1 - 2 * Math.abs(t - Math.floor(t) - 0.5);

  function drawLayer(layer) {
    const { kind, speed, base, amp, color } = layer;
    const ox = cam.x * speed;
    const y0 = base - cam.y * speed * 0.5;
    ctx.fillStyle = color;

    if (kind === 'city') {
      const bw = 74;
      const first = Math.floor(ox / bw);
      for (let i = first; i <= first + Math.ceil(VIEW.width / bw) + 1; i++) {
        const h = hash(i, 7);
        const height = amp * (0.35 + (h % 100) / 150);
        const w = bw - 10 - ((h >> 8) % 22);
        const x = i * bw - ox;
        ctx.fillStyle = color;
        ctx.fillRect(x, y0 - height, w, VIEW.height);
        if (h % 3 === 0) ctx.fillRect(x + w / 2 - 1, y0 - height - 26, 2, 26);
        if (!layer.windows) continue;
        ctx.fillStyle = layer.windows;
        for (let k = 0, wy = y0 - height + 10; wy < y0 + 30; k++, wy += 16) {
          for (let wx = 6; wx < w - 8; wx += 12) if (hash(i * 31 + wx, k) % 5 === 0) ctx.fillRect(x + wx, wy, 5, 7);
        }
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, y0 + 30, VIEW.width, VIEW.height);
      return;
    }

    const heightAt = (wx) => {
      if (kind === 'mountains') return amp * (0.65 * tri(wx / 300) + 0.35 * tri(wx / 117 + 0.4));
      if (kind === 'dunes') return amp * (0.6 + 0.5 * Math.sin(wx / 320) + 0.25 * Math.sin(wx / 133 + 1));
      return Math.sin(wx / 230) * amp + Math.sin(wx / 97) * amp * 0.35;
    };
    ctx.beginPath();
    ctx.moveTo(0, VIEW.height);
    for (let x = 0; x <= VIEW.width; x += 16) ctx.lineTo(x, y0 - heightAt(x + ox));
    ctx.lineTo(VIEW.width, VIEW.height);
    ctx.closePath();
    ctx.fill();

    if (layer.caps) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = layer.caps;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= VIEW.width; x += 16) ctx.lineTo(x, y0 - amp * 0.62 + Math.sin((x + ox) / 23) * 5);
      ctx.lineTo(VIEW.width, 0);
      ctx.fill();
      ctx.restore();
    }

    if (kind === 'pines') {
      const gap = 26;
      const first = Math.floor(ox / gap);
      ctx.beginPath();
      for (let i = first; i <= first + Math.ceil(VIEW.width / gap) + 1; i++) {
        const x = i * gap - ox;
        const ground = y0 - heightAt(i * gap) + 6;
        const tall = 26 + (hash(i, 3) % 30);
        ctx.moveTo(x - 10, ground);
        ctx.lineTo(x, ground - tall);
        ctx.lineTo(x + 10, ground);
      }
      ctx.fill();
    }
  }

  function drawBackground(time, map) {
    const theme = map.theme;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(0.65, theme.sky[1]);
    g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    if (theme.stars) {
      for (let i = 0; i < 110; i++) {
        const h = hash(i, 11);
        const x = (((h % 1600) - cam.x * 0.01) % 1600 + 1600) % 1600 - 160;
        const y = ((h >> 11) % 430) - cam.y * 0.01;
        ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * (1 + (h % 5)) + i);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, (h & 1) + 1.5, (h & 1) + 1.5);
      }
      ctx.globalAlpha = 1;
    }

    const orb = theme.sun ?? theme.moon;
    if (orb) {
      const ox = VIEW.width - 180 - cam.x * 0.02;
      const oy = 110 - cam.y * 0.02;
      const glow = ctx.createRadialGradient(ox, oy, orb.radius * 0.6, ox, oy, orb.radius * 3);
      glow.addColorStop(0, theme.moon ? 'rgba(200,215,255,0.25)' : 'rgba(255,250,220,0.35)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(ox - orb.radius * 3, oy - orb.radius * 3, orb.radius * 6, orb.radius * 6);
      ctx.fillStyle = orb.color;
      ctx.beginPath(); ctx.arc(ox, oy, orb.radius, 0, Math.PI * 2); ctx.fill();
      if (theme.moon) {
        ctx.fillStyle = 'rgba(160,170,200,0.35)';
        ctx.beginPath(); ctx.arc(ox - 10, oy - 6, 7, 0, Math.PI * 2); ctx.arc(ox + 9, oy + 9, 5, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.fillStyle = theme.clouds;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 380 + time * 12 - cam.x * 0.1) % (VIEW.width + 300)) - 150;
      const y = 70 + (i % 3) * 55 - cam.y * 0.05;
      ctx.beginPath();
      ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 40, y - 10, 40, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    theme.layers.forEach(drawLayer);

    if (theme.snowfall) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 70; i++) {
        const h = hash(i, 5);
        const x = ((((h % 1400) + Math.sin(time + i) * 20 - cam.x * 0.4) % 1400) + 1400) % 1400 - 60;
        const y = ((((h >> 11) % 800) + time * (35 + (h % 40)) - cam.y * 0.4) % 800 + 800) % 800 - 40;
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }

  function drawDecor(kind, x, y, h, lamps) {
    switch (kind) {
      case 'bush':
        ctx.fillStyle = '#3f8a2e';
        ctx.beginPath(); ctx.arc(x - 9, y - 6, 9, 0, Math.PI * 2); ctx.arc(x + 8, y - 6, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#56a83c';
        ctx.beginPath(); ctx.arc(x, y - 11, 11, 0, Math.PI * 2); ctx.fill();
        break;
      case 'drybush':
        ctx.strokeStyle = '#8a6a3f'; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = -2; i <= 2; i++) { ctx.moveTo(x, y); ctx.lineTo(x + i * 6, y - 14 + Math.abs(i) * 3); }
        ctx.stroke();
        break;
      case 'flower':
        ctx.fillStyle = '#3f8a2e'; ctx.fillRect(x - 1, y - 12, 2, 12);
        ctx.fillStyle = h & 1 ? '#ff6b9a' : '#ffd23f';
        ctx.beginPath(); ctx.arc(x, y - 14, 4, 0, Math.PI * 2); ctx.fill();
        break;
      case 'palm': {
        ctx.strokeStyle = '#7a5532'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 40, x + 14, y - 72); ctx.stroke();
        ctx.strokeStyle = '#3d9a34'; ctx.lineWidth = 5;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI + (i / 4) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x + 14, y - 72);
          ctx.quadraticCurveTo(x + 14 + Math.cos(a) * 22, y - 86 + Math.sin(a) * 4, x + 14 + Math.cos(a) * 36, y - 62 + Math.abs(Math.cos(a)) * 6);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        break;
      }
      case 'rock':
        ctx.fillStyle = '#8b8f95';
        ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 9, y - 12); ctx.lineTo(x + 4, y - 15); ctx.lineTo(x + 13, y); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath(); ctx.moveTo(x - 9, y - 12); ctx.lineTo(x + 4, y - 15); ctx.lineTo(x, y - 8); ctx.fill();
        break;
      case 'cactus':
        ctx.fillStyle = '#4f8f3a';
        ctx.fillRect(x - 5, y - 44, 10, 44);
        ctx.fillRect(x - 15, y - 30, 6, 16); ctx.fillRect(x - 15, y - 18, 12, 6);
        ctx.fillRect(x + 9, y - 36, 6, 14); ctx.fillRect(x + 3, y - 26, 12, 6);
        break;
      case 'pine':
        ctx.fillStyle = '#5a3d25'; ctx.fillRect(x - 3, y - 12, 6, 12);
        ctx.fillStyle = '#2f5a45';
        ctx.beginPath(); ctx.moveTo(x - 18, y - 10); ctx.lineTo(x, y - 62); ctx.lineTo(x + 18, y - 10); ctx.fill();
        ctx.fillStyle = '#f4f8fc';
        ctx.beginPath(); ctx.moveTo(x - 7, y - 42); ctx.lineTo(x, y - 62); ctx.lineTo(x + 7, y - 42); ctx.fill();
        break;
      case 'snowman':
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y - 11, 11, 0, Math.PI * 2); ctx.arc(x, y - 28, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f08a24'; ctx.fillRect(x + 3, y - 29, 7, 3);
        break;
      case 'barrel':
        ctx.fillStyle = h & 1 ? '#a8432f' : '#5d6b3a';
        ctx.fillRect(x - 10, y - 28, 20, 28);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 10, y - 21, 20, 3); ctx.fillRect(x - 10, y - 9, 20, 3);
        break;
      case 'antenna':
        ctx.fillStyle = '#9aa3b5'; ctx.fillRect(x - 1, y - 60, 3, 60);
        ctx.fillStyle = '#ff4d4d'; ctx.fillRect(x - 2, y - 64, 5, 5);
        break;
      case 'lamp':
        ctx.fillStyle = '#6b7385'; ctx.fillRect(x - 2, y - 70, 4, 70); ctx.fillRect(x - 2, y - 70, 16, 4);
        ctx.fillStyle = '#fff2c4'; ctx.fillRect(x + 8, y - 66, 10, 5);
        lamps.push([x + 13, y - 62]);
        break;
      default: break;
    }
  }

  function drawTerrain(map) {
    const { theme } = map;
    const palette = [null, theme.ground, theme.platform, theme.block];
    const c0 = Math.max(0, Math.floor(cam.x / TILE) - 1);
    const c1 = Math.min(map.cols - 1, Math.floor((cam.x + vw()) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / TILE));
    const r1 = Math.min(map.rows - 1, Math.floor((cam.y + vh()) / TILE) + 2);
    const lamps = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (map.grid[r][c] !== 1) continue;
        const x = c * TILE - cam.x;
        const y = r * TILE - cam.y;
        const kind = map.kinds[r][c];
        const look = palette[kind] ?? theme.ground;
        const exposedTop = r > 0 && map.grid[r - 1][c] === 0;
        const h = hash(c, r);
        ctx.fillStyle = look.body;
        ctx.fillRect(x, y, TILE + 0.5, TILE + 0.5);

        if (look.ice) {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(x + (h & 15) + 4, y + 14, 12, 3);
        } else if (look.metal) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x + 5, y + 20, 3, 3); ctx.fillRect(x + TILE - 8, y + 20, 3, 3);
        } else if (look.crate) {
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
          ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + TILE - 4, y + TILE - 4); ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(x + (h & 15) + 6, y + ((h >> 4) & 15) + 8, 6, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + ((h >> 8) & 15) + 10, y + ((h >> 12) & 15) + 14, 5, 3);
        }

        if (exposedTop) {
          ctx.fillStyle = look.top;
          ctx.fillRect(x, y, TILE + 0.5, 9);
          ctx.fillStyle = look.topEdge;
          if (look.metal) {
            for (let i = 0; i < TILE; i += 10) ctx.fillRect(x + i, y + 7, 5, 3);
          } else {
            ctx.fillRect(x, y + 7, TILE + 0.5, 3);
            ctx.fillStyle = look.top;
            ctx.fillRect(x + (h % 30), y + 9, 5, 3 + (h >> 5) % 4);
          }
          const decor = theme.decor[(h >> 7) % theme.decor.length];
          if (decor && kind === KIND.ground && (h >> 3) % 4 === 0 && r > 2 && map.grid[r - 2][c] === 0) {
            drawDecor(decor, x + TILE / 2, y + 2, h, lamps);
          }
        }
        if (c > 0 && map.grid[r][c - 1] === 0) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y, 3, TILE); }
        if (c < map.cols - 1 && map.grid[r][c + 1] === 0) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + TILE - 3, y, 3, TILE); }
      }
    }

    if (lamps.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [lx, ly] of lamps) {
        const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly + 30, 120);
        glow.addColorStop(0, 'rgba(255,214,120,0.45)');
        glow.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(lx - 120, ly - 90, 240, 240);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function inReach(pl, p) {
    return pl.alive && Math.abs(p.x - (pl.x + pl.w / 2)) <= REACH.x && Math.abs(p.y - (pl.y + pl.h / 2)) <= REACH.y;
  }

  function drawReach(p, x, y, time) {
    const pulse = effects.calm() ? 0.75 : 0.6 + 0.4 * Math.sin(time * 7);
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 46);
    glow.addColorStop(0, `rgba(255,236,140,${0.55 * pulse})`);
    glow.addColorStop(1, 'rgba(255,236,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
    if (NEEDS_KEY.has(p.kind)) badges.push(x + 32, y - 34);
  }

  const badges = [];
  function drawKeyBadges() {
    for (let i = 0; i < badges.length; i += 2) drawKeyBadge(badges[i], badges[i + 1]);
    badges.length = 0;
  }

  function drawKeyBadge(bx, by) {
    ctx.fillStyle = 'rgba(20,20,24,0.85)';
    ctx.strokeStyle = '#ffe135';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(bx - 10, by - 10, 20, 20, 4); ctx.fill(); ctx.stroke();
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe135';
    ctx.fillText('E', bx, by + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawPickups(world, time) {
    const me = world.player;
    badges.length = 0;
    for (const p of world.pickups) {
      if (!p.active && p.kind === 'banana' && p.timer > 0) {
        const x = p.x - cam.x;
        const y = p.y - cam.y;
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#ffe135';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x - 18, y - 18, 36, 28);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        const t = Math.ceil(p.timer);
        label(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, x, y - 1, 12, 'rgba(255,225,53,0.85)');
        continue;
      }
      if (!p.active) continue;
      const bob = Math.sin(time * 3 + p.x) * 3;
      const x = p.x - cam.x;
      const y = p.y - cam.y + bob;
      const near = me && inReach(me, p);
      if (near) drawReach(p, x, y, time);
      if (p.kind === 'health') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.fillRect(x - 13, y - 13, 26, 22); ctx.strokeRect(x - 13, y - 13, 26, 22);
        ctx.fillStyle = '#e63946';
        ctx.fillRect(x - 3, y - 10, 6, 16); ctx.fillRect(x - 8, y - 5, 16, 6);
      } else if (p.kind === 'banana') {
        ctx.fillStyle = '#ffe135';
        ctx.strokeStyle = '#8a6d00';
        ctx.lineWidth = 2.5;
        ctx.fillRect(x - 18, y - 18, 36, 28); ctx.strokeRect(x - 18, y - 18, 36, 28);
        ctx.strokeStyle = '#6b4f00';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y - 16, 12, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
        ctx.strokeStyle = '#fff6a8';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 16, 12, 0.3 * Math.PI, 0.7 * Math.PI); ctx.stroke();
        label('BANANA CRATE', x, y - 26, 11, '#ffe135');
      } else if (p.kind === 'shield') {
        ctx.fillStyle = '#4cc9f0';
        ctx.strokeStyle = '#0b3d5c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 15); ctx.lineTo(x + 13, y - 10); ctx.lineTo(x + 11, y + 2); ctx.lineTo(x, y + 10); ctx.lineTo(x - 11, y + 2); ctx.lineTo(x - 13, y - 10);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e0f7ff';
        ctx.fillRect(x - 2, y - 9, 4, 13);
        label('SHIELD', x, y - 22, 11, '#4cc9f0');
      } else if (p.kind === 'fuel') {
        ctx.fillStyle = '#2a9d8f';
        ctx.strokeStyle = '#123f3a';
        ctx.lineWidth = 2;
        ctx.fillRect(x - 11, y - 14, 22, 24); ctx.strokeRect(x - 11, y - 14, 22, 24);
        ctx.fillRect(x + 3, y - 19, 7, 5);
        ctx.beginPath(); ctx.moveTo(x - 7, y - 10); ctx.lineTo(x + 7, y + 6); ctx.moveTo(x + 7, y - 10); ctx.lineTo(x - 7, y + 6); ctx.stroke();
        label('JET FUEL', x, y - 25, 11, '#7be0c3');
      } else if (p.kind === 'ammo') {
        ctx.fillStyle = '#6b705c';
        ctx.strokeStyle = '#2f3127';
        ctx.lineWidth = 2;
        ctx.fillRect(x - 15, y - 8, 30, 18); ctx.strokeRect(x - 15, y - 8, 30, 18);
        ctx.fillStyle = '#e9c46a';
        for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * 8 - 2, y - 15, 4, 7);
        label('AMMO', x, y - 22, 11, '#e9c46a');
      } else if (p.dropped) {
        const gy = p.y - cam.y + 5;
        drawWeaponPickup(ctx, p.weapon, x, gy, { scale: 1.1 });
        label(WEAPONS[p.weapon].name, x, gy - 12, 11);
      } else {
        const glow = ctx.createRadialGradient(x, y + 2, 2, x, y + 2, 30);
        glow.addColorStop(0, 'rgba(255,240,170,0.55)');
        glow.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.ellipse(x, y, 36, 20, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(x, p.y - cam.y + 14, 18 - bob, 3, 0, 0, Math.PI * 2); ctx.fill();
        drawWeaponPickup(ctx, p.weapon, x, y - 4, { scale: 1.6, angle: -0.12 + Math.sin(time * 2 + p.x) * 0.08 });
        label(WEAPONS[p.weapon].name, x, y - 24, 11);
      }
    }
  }

  function label(text, x, y, size = 12, color = '#fff') {
    ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawSolvingBubble(cx, cy, iconY, time) {
    const calm = effects.calm();
    ctx.fillStyle = 'rgba(255,225,53,0.16)';
    ctx.strokeStyle = 'rgba(255,225,53,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, 38 + (calm ? 0 : Math.sin(time * 3) * 1.5), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(40,30,0,0.75)';
    ctx.beginPath(); ctx.arc(cx, iconY, 15, 0, Math.PI * 2); ctx.fill();
    const turn = calm ? 0 : time * 4;
    ctx.strokeStyle = '#ffe135';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, iconY, 18.5, turn, turn + Math.PI * 1.3); ctx.stroke();
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe135';
    ctx.fillText('🍌?', cx, iconY + 1);
    ctx.textBaseline = 'alphabetic';
  }

  function drawSoldiers(world, time) {
    for (const s of world.soldiers) {
      if (!s.alive) continue;
      const view = { ...s, x: s.x - cam.x, y: s.y - cam.y, weapon: activeGun(s).key, shielded: s.shieldTimer > 0 && !s.busy, recoil: effects.recoilOf(s) };
      effects.applyPose(s, view);
      const pw = s.power && POWERS[s.power.id ?? s.power];
      if (pw && !(s.power.timer < 2 && Math.floor(time * 8) % 2)) {
        const gx = view.x + s.w / 2;
        const gy = view.y + s.h / 2;
        const glow = ctx.createRadialGradient(gx, gy, 6, gx, gy, 46);
        glow.addColorStop(0, `${pw.color}aa`);
        glow.addColorStop(1, `${pw.color}00`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(gx, gy, 46, 0, Math.PI * 2); ctx.fill();
        if (s.power.id === 'bubble' || s.power === 'bubble') {
          ctx.strokeStyle = 'rgba(255,240,150,0.8)';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(gx, gy, 36 + Math.sin(time * 6) * 2, 0, Math.PI * 2); ctx.stroke();
        }
      }
      drawSoldier(ctx, view, s.avatar, time);
      const cx = view.x + s.w / 2;
      if (s.busy) drawSolvingBubble(cx, view.y + s.h / 2, view.y - 52, time);
      const tagColor = s.isPlayer ? '#ffe135' : s.team === 'blue' ? '#7ec8ff' : s.team === 'red' ? '#ff8a8a' : '#ffffff';
      label(s.name, cx, view.y - 22, 12, tagColor);
      if (!s.isPlayer) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(cx - 18, view.y - 16, 36, 5);
        ctx.fillStyle = s.health > 50 ? '#52b788' : s.health > 25 ? '#f4a261' : '#e63946';
        ctx.fillRect(cx - 18, view.y - 16, 36 * (s.health / SOLDIER.maxHealth), 5);
      }
    }
  }

  function drawProjectiles(world) {
    ctx.lineCap = 'round';
    for (const b of world.bullets) {
      const x = b.x - cam.x;
      const y = b.y - cam.y;
      const dx = b.x - (b.px ?? b.x);
      const dy = b.y - (b.py ?? b.y);
      const len = Math.hypot(dx, dy) || 1;
      const sniper = b.color === WEAPONS.sniper.color;
      const tail = Math.min(sniper ? 160 : 90, len * 2.5);
      const ux = dx / len;
      const uy = dy / len;
      ctx.strokeStyle = b.color;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.15 + i * 0.3;
        ctx.lineWidth = (sniper ? 2.5 : 1.5) + i * 0.4;
        ctx.beginPath();
        ctx.moveTo(x - ux * tail * (1 - i / 3), y - uy * tail * (1 - i / 3));
        ctx.lineTo(x - ux * tail * (1 - (i + 1) / 3), y - uy * tail * (1 - (i + 1) / 3));
        ctx.stroke();
      }
      const speed = Math.hypot(b.vx ?? 0, b.vy ?? 0);
      if (speed >= TRACER_SPEED) {
        const tl = Math.min(speed * 0.022, 64);
        const tx = (b.vx / speed) * tl;
        const ty = (b.vy / speed) * tl;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#fffbe6';
        ctx.lineWidth = sniper ? 1.6 : 1.1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - tx, y - ty); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const r of world.rockets) {
      const a = Math.atan2(r.vy, r.vx);
      ctx.save();
      ctx.translate(r.x - cam.x, r.y - cam.y);
      ctx.rotate(a);
      ctx.fillStyle = '#4a5d23'; ctx.fillRect(-12, -3, 18, 6);
      ctx.fillStyle = '#c0392b'; ctx.fillRect(6, -3, 5, 6);
      ctx.fillStyle = '#ffbe0b'; ctx.beginPath(); ctx.moveTo(-12, -3); ctx.lineTo(-22 - Math.random() * 6, 0); ctx.lineTo(-12, 3); ctx.fill();
      ctx.restore();
    }
    for (const f of world.flames) {
      const t = f.age / f.life;
      ctx.globalAlpha = 0.85 * (1 - t);
      ctx.fillStyle = t < 0.3 ? '#fff3b0' : t < 0.6 ? '#ff9f1c' : '#e63946';
      ctx.beginPath(); ctx.arc(f.x - cam.x, f.y - cam.y, 6 + f.age * 40, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const g of world.grenades) {
      ctx.fillStyle = '#2d4a22';
      ctx.beginPath(); ctx.arc(g.x - cam.x, g.y - cam.y, 6, 0, Math.PI * 2); ctx.fill();
      if (Math.floor(g.fuse * 8) % 2 === 0) { ctx.fillStyle = '#ff006e'; ctx.beginPath(); ctx.arc(g.x - cam.x, g.y - cam.y - 5, 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function drawParticles(world) {
    for (const p of world.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2.5);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawLaser(mouse, world) {
    const p = world.player;
    if (!laser || !p.alive) return;
    const gx = p.x + p.w / 2;
    const gy = p.y + 25;
    const aim = toWorld(mouse.x, mouse.y);
    const hit = raycast(world.map, gx, gy, aim.x, aim.y, 8);
    const from = toViewFromWorld(gx, gy);
    const to = hit ? toViewFromWorld(hit.x, hit.y) : mouse;
    ctx.strokeStyle = 'rgba(230, 57, 70, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function drawFuelWarning(world, time) {
    const p = world.player;
    if (!p.alive || p.fuel >= LOW_FUEL || p.busy) return;
    const calm = effects.calm();
    if (!calm && Math.floor(time * 5) % 2) return;
    const x = p.x + p.w / 2 - cam.x;
    const y = p.y + p.h + 18 - cam.y;
    const empty = p.fuel <= 1;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(x - 24, y - 10, 48, 16, 4); ctx.fill();
    label(empty ? 'NO FUEL' : 'FUEL', x, y + 3, 11, empty ? '#ff5a5a' : '#ffb347');
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(x - 20, y + 8, 40 * Math.max(0, p.fuel) / LOW_FUEL, 2);
  }

  let lensTint = null;
  function drawScope(mouse) {
    if (scopeT < 0.01) return;
    const ease = 1 - (1 - scopeT) * (1 - scopeT);
    if (!lensTint) {
      const cx = VIEW.width / 2;
      const cy = VIEW.height / 2;
      lensTint = ctx.createRadialGradient(cx, cy, VIEW.height * 0.5, cx, cy, Math.hypot(cx, cy));
      lensTint.addColorStop(0, 'rgba(6,10,14,0)');
      lensTint.addColorStop(0.55, 'rgba(6,10,14,0.18)');
      lensTint.addColorStop(1, 'rgba(6,10,14,0.35)');
    }
    ctx.globalAlpha = ease;
    ctx.fillStyle = lensTint;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const { x, y } = mouse;
    const r = 34;
    ctx.strokeStyle = 'rgba(10,14,18,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r - 46, y); ctx.lineTo(x - 20, y); ctx.moveTo(x + 20, y); ctx.lineTo(x + r + 46, y);
    ctx.moveTo(x, y - r - 46); ctx.lineTo(x, y - 20); ctx.moveTo(x, y + 20); ctx.lineTo(x, y + r + 46);
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,14,18,0.75)';
    for (const d of [r * 0.45, r * 0.8]) {
      ctx.fillRect(x - d - 1, y + 3, 2, 3); ctx.fillRect(x + d - 1, y + 3, 2, 3);
      ctx.fillRect(x - 1, y + d - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function drawCrosshair(mouse, world) {
    const p = world.player;
    const reloading = p.reloadTimer > 0;
    ctx.strokeStyle = reloading ? '#f4a261' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 11, 0, Math.PI * 2);
    ctx.moveTo(mouse.x - 18, mouse.y); ctx.lineTo(mouse.x - 6, mouse.y);
    ctx.moveTo(mouse.x + 6, mouse.y); ctx.lineTo(mouse.x + 18, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 18); ctx.lineTo(mouse.x, mouse.y - 6);
    ctx.moveTo(mouse.x, mouse.y + 6); ctx.lineTo(mouse.x, mouse.y + 18);
    ctx.stroke();
    ctx.fillStyle = '#e63946';
    ctx.fillRect(mouse.x - 1.5, mouse.y - 1.5, 3, 3);
  }

  function render(world, mouse, dt, zoomTarget = 1) {
    const p = world.player;
    const engaged = p.alive && zoomTarget < 1;
    scoped = engaged && activeGun(p).key === 'sniper';
    const wantScale = scoped ? ZOOM_SCALE.scope : engaged ? ZOOM_SCALE.far : ZOOM_SCALE.normal;
    const wantLook = scoped ? LOOK.scope : engaged ? LOOK.far : LOOK.normal;
    const ks = Math.min(1, dt * 6 || 1);
    if (!effects.frozen) scale += (wantScale - scale) * ks;
    look += (wantLook - look) * ks;
    scopeT += ((scoped ? 1 : 0) - scopeT) * Math.min(1, dt * 7);
    if (!effects.frozen) updateCamera(world, mouse, dt);
    effects.update(world, dt);
    const { offset } = effects;
    cam.x += offset.x;
    cam.y += offset.y;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(world.time, world.map);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawTerrain(world.map);
    effects.drawUnder(ctx, cam, world.time);
    drawPickups(world, world.time);
    drawSoldiers(world, world.time);
    drawKeyBadges();
    drawProjectiles(world);
    drawParticles(world);
    effects.drawWorld(ctx, cam);
    drawFuelWarning(world, world.time);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!world.player.alive) {
      ctx.fillStyle = 'rgba(80,0,0,0.25)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    drawLaser(mouse, world);
    effects.drawScreen(ctx);
    cam.x -= offset.x;
    cam.y -= offset.y;
    drawScope(mouse);
    drawCrosshair(mouse, world);
    effects.drawHud(ctx, mouse);
  }

  return {
    render, toView, toWorld, toViewFromWorld,
    get scoped() { return scoped; },
    get zoomLabel() { return scoped ? 'SCOPE' : scale < 0.95 ? 'FAR' : '1x'; },
    setLaser: (on) => { laser = on; },
    setBanners: (on) => effects.setBanners(on),
  };
}
