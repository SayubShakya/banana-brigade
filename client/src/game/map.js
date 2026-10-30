// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { TILE } from './config.js';
import { MAPS } from './maps.js';

export { MAPS, MAP_IDS, mapName, randomMapId } from './maps.js';

const COLS = 90;
const ROWS = 36;

export const KIND = { ground: 1, platform: 2, block: 3 };

function buildGrid(def) {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  const kinds = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  const fill = (c, r, w, h, kind, value = 1) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) { grid[y][x] = value; kinds[y][x] = value ? kind : 0; }
    }
  };

  for (let c = 0; c < COLS; c++) fill(c, def.ground(c), 1, ROWS, KIND.ground);
  (def.carve ?? []).forEach(([c, r, w, h]) => fill(c, r, w, h, 0, 0));
  def.platforms.forEach(([c, r, w, h]) => fill(c, r, w, h, KIND.platform));
  def.blocks.forEach(([c, r, w, h]) => fill(c, r, w, h, KIND.block));

  fill(0, 0, COLS, 1, KIND.ground);
  fill(0, 0, 1, ROWS, KIND.ground);
  fill(COLS - 1, 0, 1, ROWS, KIND.ground);
  return { grid, kinds };
}

const tileCenter = ([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });

export function createMap(id = 'jungle') {
  const def = MAPS[id] ?? MAPS.jungle;
  const { grid, kinds } = buildGrid(def);
  return {
    id: def.id,
    name: def.name,
    theme: def.theme,
    grid,
    kinds,
    cols: COLS,
    rows: ROWS,
    width: COLS * TILE,
    height: ROWS * TILE,
    spawns: def.spawns.map(tileCenter),
    healthSpots: def.health.map(tileCenter),
    crateSpots: def.crates.map(tileCenter),
    bananaSpots: def.bananas.map(tileCenter),
  };
}

export function isSolid(map, px, py) {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return true;
  return map.grid[r][c] === 1;
}

function boxHitsSolid(map, x, y, w, h) {
  const c0 = Math.floor(x / TILE);
  const c1 = Math.floor((x + w - 0.01) / TILE);
  const r0 = Math.floor(y / TILE);
  const r1 = Math.floor((y + h - 0.01) / TILE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (c < 0 || r < 0 || c >= map.cols || r >= map.rows || map.grid[r][c] === 1) return true;
  }
  return false;
}

export function moveBox(map, b, dt) {
  const hit = { left: false, right: false, top: false, bottom: false };

  let nx = b.x + b.vx * dt;
  if (boxHitsSolid(map, nx, b.y, b.w, b.h)) {
    if (b.vx > 0) { nx = Math.floor((nx + b.w) / TILE) * TILE - b.w - 0.01; hit.right = true; }
    else if (b.vx < 0) { nx = (Math.floor(nx / TILE) + 1) * TILE + 0.01; hit.left = true; }
    b.vx = 0;
  }
  b.x = nx;

  let ny = b.y + b.vy * dt;
  if (boxHitsSolid(map, b.x, ny, b.w, b.h)) {
    if (b.vy > 0) { ny = Math.floor((ny + b.h) / TILE) * TILE - b.h - 0.01; hit.bottom = true; }
    else if (b.vy < 0) { ny = (Math.floor(ny / TILE) + 1) * TILE + 0.01; hit.top = true; }
    b.vy = 0;
  }
  b.y = ny;
  return hit;
}

export function raycast(map, x0, y0, x1, y1, step = 6) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i <= n; i++) {
    const x = x0 + (dx * i) / n;
    const y = y0 + (dy * i) / n;
    if (isSolid(map, x, y)) return { x, y };
  }
  return null;
}

export const hasLineOfSight = (map, a, b) => raycast(map, a.x, a.y, b.x, b.y, 10) === null;
