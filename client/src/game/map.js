// Tile map: builds the 90 x 36 grid for a map from maps.js and gives the physics helpers
// (solid tile test, box movement with collision, raycast / line of sight). Used by client and server.
import { TILE } from './config.js';
import { MAPS } from './maps.js';

export { MAPS, MAP_IDS, mapName, randomMapId } from './maps.js';

const COLS = 90;
const ROWS = 36;

// Tile kinds, used for drawing (ground, thin platform, block).
export const KIND = { ground: 1, platform: 2, block: 3 };

/**
 * Builds the solid grid (1 = solid, 0 = air) and a matching "kinds" grid from a map definition.
 * Order: ground columns, carve out caves, add platforms and blocks, then close the borders.
 */
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

  // Solid ceiling and side walls so nobody can leave the map.
  fill(0, 0, COLS, 1, KIND.ground);
  fill(0, 0, 1, ROWS, KIND.ground);
  fill(COLS - 1, 0, 1, ROWS, KIND.ground);
  return { grid, kinds };
}

// Converts a [column, row] tile position into the pixel centre of that tile.
const tileCenter = ([c, r]) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });

/**
 * Creates a playable map object (falls back to jungle for an unknown id).
 * @param {string} id map id, e.g. 'jungle', 'desert'
 * @returns {object} grid, size in pixels and spawn / health / crate / banana spots
 */
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

// True if the pixel (px, py) is inside a solid tile. Outside the map counts as solid.
export function isSolid(map, px, py) {
  const c = Math.floor(px / TILE);
  const r = Math.floor(py / TILE);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return true;
  return map.grid[r][c] === 1;
}

// True if a rectangle overlaps any solid tile (checks every tile the box touches).
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

/**
 * Moves a body by its velocity for dt seconds and stops it at walls.
 * Axis-separated collision: move on X first and resolve, then move on Y and resolve.
 * This lets a soldier slide along a floor or wall instead of sticking.
 * @param {object} b body with x, y, w, h, vx, vy (changed in place)
 * @returns {{left,right,top,bottom}} which sides hit something (bottom = standing on ground)
 */
export function moveBox(map, b, dt) {
  const hit = { left: false, right: false, top: false, bottom: false };

  let nx = b.x + b.vx * dt;
  if (boxHitsSolid(map, nx, b.y, b.w, b.h)) {
    // Snap flush against the wall (0.01 px gap) and stop horizontal speed.
    if (b.vx > 0) { nx = Math.floor((nx + b.w) / TILE) * TILE - b.w - 0.01; hit.right = true; }
    else if (b.vx < 0) { nx = (Math.floor(nx / TILE) + 1) * TILE + 0.01; hit.left = true; }
    b.vx = 0;
  }
  b.x = nx;

  let ny = b.y + b.vy * dt;
  if (boxHitsSolid(map, b.x, ny, b.w, b.h)) {
    // Moving down and hit: we landed on the floor. Moving up and hit: we bumped the ceiling.
    if (b.vy > 0) { ny = Math.floor((ny + b.h) / TILE) * TILE - b.h - 0.01; hit.bottom = true; }
    else if (b.vy < 0) { ny = (Math.floor(ny / TILE) + 1) * TILE + 0.01; hit.top = true; }
    b.vy = 0;
  }
  b.y = ny;
  return hit;
}

/**
 * Walks along the line from (x0, y0) to (x1, y1) in small steps and returns the first solid point.
 * Used for bullets, line of sight and aim checks.
 * @returns {{x,y}|null} the hit point, or null if the line is clear
 */
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

// True when nothing solid is between a and b (used by bots to "see" targets).
export const hasLineOfSight = (map, a, b) => raycast(map, a.x, a.y, b.x, b.y, 10) === null;
