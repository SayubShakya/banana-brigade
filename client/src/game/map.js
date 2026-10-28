// The battlefield: a tile grid with hills, floating platforms and pillars, plus the
// collision and line-of-sight helpers that soldiers, bullets and bots use.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { TILE } from './config.js';

const COLS = 90;
const ROWS = 36;

function buildGrid() {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  const fill = (c, r, w, h) => {
    for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) {
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) grid[y][x] = 1;
    }
  };

  fill(0, 0, COLS, 1);            // ceiling
  fill(0, 0, 1, ROWS);            // left wall
  fill(COLS - 1, 0, 1, ROWS);     // right wall

  // Ground with two hills and a trench in the middle.
  for (let c = 0; c < COLS; c++) {
    let top = 32;
    if (c >= 14 && c <= 26) top = 32 - Math.round(3 * Math.sin(((c - 14) / 12) * Math.PI));
    if (c >= 60 && c <= 74) top = 32 - Math.round(4 * Math.sin(((c - 60) / 14) * Math.PI));
    if (c >= 40 && c <= 48) top = 34;
    fill(c, top, 1, ROWS - top);
  }

  // Floating platforms (col, row, width, height).
  [
    [6, 25, 8, 1], [21, 21, 10, 1], [35, 26, 7, 1], [45, 19, 12, 1], [59, 22, 9, 1],
    [75, 25, 9, 1], [29, 13, 9, 1], [54, 11, 11, 1], [10, 15, 8, 1], [72, 14, 9, 1],
    [40, 29, 3, 1], [46, 29, 3, 1], [3, 8, 6, 1], [81, 8, 6, 1],
  ].forEach(([c, r, w, h]) => fill(c, r, w, h));

  // Pillars and a bunker roof to fight around.
  [[33, 23, 1, 3], [57, 16, 1, 3], [24, 27, 1, 3], [66, 26, 1, 2], [49, 7, 1, 4]].forEach(([c, r, w, h]) => fill(c, r, w, h));
  return grid;
}

// Spawn points, health packs and weapon crates (in tile coordinates, standing on a surface).
const SPAWNS = [[4, 31], [10, 24], [26, 20], [38, 25], [50, 18], [63, 21], [79, 24], [85, 31], [33, 12], [58, 10], [13, 14], [76, 13]];
const HEALTH = [[44, 33], [6, 7], [84, 7], [51, 18]];
const CRATES = [[18, 28], [30, 12], [60, 10], [70, 28], [8, 24], [80, 24]];
const BANANA_CRATES = [[24, 20], [64, 21]];

const tileCenter = ([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });

export function createMap() {
  const grid = buildGrid();
  return {
    grid,
    cols: COLS,
    rows: ROWS,
    width: COLS * TILE,
    height: ROWS * TILE,
    spawns: SPAWNS.map(tileCenter),
    healthSpots: HEALTH.map(tileCenter),
    crateSpots: CRATES.map(tileCenter),
    bananaSpots: BANANA_CRATES.map(tileCenter),
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

// Moves a box {x, y, w, h, vx, vy} by its velocity, stopping at walls.
// Resolves the x axis first, then y, and reports which sides were hit.
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

// Walks along a line in small steps; returns the first solid point, or null if the line is clear.
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
