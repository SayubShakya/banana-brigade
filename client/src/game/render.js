// Banana Brigade renderer. Draws the world onto the canvas: sky and hills, the terrain, pickups, soldiers,
// bullets and effects, then the crosshair. The camera follows the player and leans
// towards where they are aiming, so you can see further in that direction.
// Shooting effects (flashes, sparks, hit markers, shake) come from effects.js; the
// sniper scope overlay is drawn here when the sniper is at full zoom.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { VIEW, TILE, WEAPONS, SOLDIER, ZOOM_LEVELS } from './config.js';
import { drawSoldier } from './characters.js';
import { activeGun } from './world.js';
import { raycast } from './map.js';
import { createEffects } from './effects.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0 };
  let dpr = 1;
  let scale = 1;          // world zoom: 1 = normal, smaller = see further
  let laser = true;       // sight laser from the gun to the crosshair (Settings)
  const vw = () => VIEW.width / scale;
  const vh = () => VIEW.height / scale;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW.width * dpr;
    canvas.height = VIEW.height * dpr;
  }
  resize();
  window.addEventListener('resize', resize);

  // Mouse position on the page -> position in the 1280x720 view.
  function toView(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * VIEW.width, y: ((clientY - r.top) / r.height) * VIEW.height };
  }
  const toWorld = (vx, vy) => ({ x: vx / scale + cam.x, y: vy / scale + cam.y });
  const toViewFromWorld = (wx, wy) => ({ x: (wx - cam.x) * scale, y: (wy - cam.y) * scale });
  const onScreen = (wx, wy) => wx >= cam.x && wx <= cam.x + vw() && wy >= cam.y && wy <= cam.y + vh();
  const effects = createEffects({ toViewFromWorld, onScreen });
  let scopeT = 0;         // 0 = no scope, 1 = sniper scope fully in

  function updateCamera(world, mouse, dt) {
    const p = world.player;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    const lookX = ((mouse.x - VIEW.width / 2) / scale) * 0.35;
    const lookY = ((mouse.y - VIEW.height / 2) / scale) * 0.35;
    const tx = Math.max(0, Math.min(world.map.width - vw(), px - vw() / 2 + lookX));
    const ty = Math.max(0, Math.min(world.map.height - vh(), py - vh() / 2 + lookY));
    // Through the scope the camera follows more slowly, so the aim feels steadier.
    const k = Math.min(1, dt * (8 - 5 * scopeT));
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  function drawBackground(time) {
    const g = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    g.addColorStop(0, '#6cb4e4');
    g.addColorStop(0.65, '#bfe3f0');
    g.addColorStop(1, '#d9eecf');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    ctx.fillStyle = 'rgba(255,248,200,0.9)';
    ctx.beginPath(); ctx.arc(VIEW.width - 160 - cam.x * 0.02, 110 - cam.y * 0.02, 46, 0, Math.PI * 2); ctx.fill();

    // Clouds drift slowly.
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 380 + time * 12 - cam.x * 0.1) % (VIEW.width + 300)) - 150;
      const y = 70 + (i % 3) * 55 - cam.y * 0.05;
      ctx.beginPath();
      ctx.ellipse(x, y, 60, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 40, y - 10, 40, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Two layers of hills for depth.
    const hills = (speed, base, amp, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, VIEW.height);
      for (let x = 0; x <= VIEW.width; x += 20) {
        const wx = x + cam.x * speed;
        ctx.lineTo(x, base - cam.y * speed * 0.5 + Math.sin(wx / 230) * amp + Math.sin(wx / 97) * amp * 0.35);
      }
      ctx.lineTo(VIEW.width, VIEW.height);
      ctx.fill();
    };
    hills(0.15, 470, 50, '#9cc7a4');
    hills(0.3, 540, 40, '#7aa874');
  }

  function drawTerrain(map) {
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const c1 = Math.min(map.cols - 1, Math.floor((cam.x + vw()) / TILE));
    const r0 = Math.max(0, Math.floor(cam.y / TILE));
    const r1 = Math.min(map.rows - 1, Math.floor((cam.y + vh()) / TILE));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (map.grid[r][c] !== 1) continue;
        const x = c * TILE - cam.x;
        const y = r * TILE - cam.y;
        const exposedTop = r > 0 && map.grid[r - 1][c] === 0;
        ctx.fillStyle = '#7b5435';
        ctx.fillRect(x, y, TILE + 0.5, TILE + 0.5);
        // Speckles from a fixed per-tile hash, so they do not flicker.
        const h = (c * 73856093) ^ (r * 19349663);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x + (h & 15) + 6, y + ((h >> 4) & 15) + 8, 6, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + ((h >> 8) & 15) + 10, y + ((h >> 12) & 15) + 14, 5, 3);
        if (exposedTop) {
          ctx.fillStyle = '#5fae3b';
          ctx.fillRect(x, y, TILE + 0.5, 9);
          ctx.fillStyle = '#4a8f2d';
          ctx.fillRect(x, y + 7, TILE + 0.5, 3);
        }
        if (c > 0 && map.grid[r][c - 1] === 0) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y, 3, TILE); }
        if (c < map.cols - 1 && map.grid[r][c + 1] === 0) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + TILE - 3, y, 3, TILE); }
      }
    }
  }

  function drawPickups(world, time) {
    for (const p of world.pickups) {
      if (!p.active) continue;
      const bob = Math.sin(time * 3 + p.x) * 3;
      const x = p.x - cam.x;
      const y = p.y - cam.y + bob;
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
        // a banana on the lid
        ctx.strokeStyle = '#6b4f00';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y - 16, 12, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
        ctx.strokeStyle = '#fff6a8';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y - 16, 12, 0.3 * Math.PI, 0.7 * Math.PI); ctx.stroke();
        label('BANANA CRATE', x, y - 26, 11, '#ffe135');
      } else if (p.dropped) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x - 14, y + 2, 28, 7);
        label(WEAPONS[p.weapon].name, x, y - 8, 11);
      } else {
        ctx.fillStyle = '#b07d3a';
        ctx.strokeStyle = '#5e3c14';
        ctx.lineWidth = 2;
        ctx.fillRect(x - 16, y - 16, 32, 26); ctx.strokeRect(x - 16, y - 16, 32, 26);
        ctx.beginPath(); ctx.moveTo(x - 16, y - 16); ctx.lineTo(x + 16, y + 10); ctx.moveTo(x + 16, y - 16); ctx.lineTo(x - 16, y + 10); ctx.stroke();
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

  function drawSoldiers(world, time) {
    for (const s of world.soldiers) {
      if (!s.alive) continue;
      const view = { ...s, x: s.x - cam.x, y: s.y - cam.y, weapon: activeGun(s).key, shielded: s.shieldTimer > 0, recoil: effects.recoilOf(s) };
      drawSoldier(ctx, view, s.avatar, time);
      const cx = view.x + s.w / 2;
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

  // Tracers: a bright head with a tail that fades out behind the bullet.
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

  // A faint red sight line from the gun towards the crosshair; it stops at walls.
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

  // Sniper scope: dark vignette outside a round lens, a faint lens tint and a thin
  // reticle with mil-dots. The lens shrinks into place as the scope comes in.
  let lensTint = null;
  function drawScope(mouse) {
    if (scopeT < 0.01) return;
    const ease = 1 - (1 - scopeT) * (1 - scopeT);
    const r = 250 + (1 - ease) * 500;
    const { x, y } = mouse;
    ctx.globalAlpha = ease;
    ctx.fillStyle = 'rgba(8,10,12,0.86)';
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.width, VIEW.height);
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill('evenodd');
    if (!lensTint) {
      lensTint = ctx.createRadialGradient(0, 0, 0.55, 0, 0, 1);
      lensTint.addColorStop(0, 'rgba(120,200,255,0.05)');
      lensTint.addColorStop(1, 'rgba(0,30,40,0.45)');
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r, r);
    ctx.fillStyle = lensTint;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#05070a';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    // Reticle: thick posts at the edge, thin lines to the middle, mil-dots every r/6.
    ctx.strokeStyle = 'rgba(10,10,10,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.45, y); ctx.moveTo(x + r * 0.45, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y + r); ctx.lineTo(x, y + r * 0.45);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.45, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + r * 0.45, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + r * 0.45);
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,10,10,0.9)';
    for (let i = 1; i <= 3; i++) {
      const d = (r / 6) * i * 0.9;
      ctx.fillRect(x - d - 1.5, y - 1.5, 3, 3); ctx.fillRect(x + d - 1.5, y - 1.5, 3, 3);
      ctx.fillRect(x - 1.5, y - d - 1.5, 3, 3); ctx.fillRect(x - 1.5, y + d - 1.5, 3, 3);
    }
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawCrosshair(mouse, world) {
    if (scopeT > 0.6) return;   // the scope reticle replaces the crosshair
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
    scale += (zoomTarget - scale) * Math.min(1, dt * 6 || 1);
    const p = world.player;
    const scoped = p.alive && activeGun(p).key === 'sniper' && zoomTarget <= ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    scopeT += ((scoped ? 1 : 0) - scopeT) * Math.min(1, dt * 7);
    updateCamera(world, mouse, dt);
    effects.update(world, dt);
    // Recoil kick and screen shake move the camera only while the world is drawn.
    const { offset } = effects;
    cam.x += offset.x;
    cam.y += offset.y;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(world.time);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    drawTerrain(world.map);
    drawPickups(world, world.time);
    drawSoldiers(world, world.time);
    drawProjectiles(world);
    drawParticles(world);
    effects.drawWorld(ctx, cam);
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
    setLaser: (on) => { laser = on; },
    setBanners: (on) => effects.setBanners(on),
  };
}
