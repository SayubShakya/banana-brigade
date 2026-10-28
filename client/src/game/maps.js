// The four battlefields as plain data: the ground line, floating platforms, solid
// blocks (pillars, bunkers, crate stacks), where soldiers spawn and where pickups sit,
// plus a colour theme for the renderer. map.js turns one of these into a tile grid.
// Both the browser and the server load this file, so it holds data only (no DOM).
//
// Coordinates are in tiles: [col, row] for points, [col, row, width, height] for boxes.
// A spawn or pickup point is the empty tile a soldier's feet stand in, so the tile
// below it is solid. tests/maps.test.js checks every map is fair and fully reachable.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const bump = (c, from, to, height) =>
  (c >= from && c <= to ? Math.round(height * Math.sin(((c - from) / (to - from)) * Math.PI)) : 0);

export const MAPS = {
  // The original battlefield: two grassy hills and a trench, with jungle on top.
  jungle: {
    id: 'jungle',
    name: 'Jungle Ridge',
    ground: (c) => (c >= 40 && c <= 48 ? 34 : 32 - bump(c, 14, 26, 3) - bump(c, 60, 74, 4)),
    platforms: [
      [6, 25, 8, 1], [21, 21, 10, 1], [35, 26, 7, 1], [45, 19, 12, 1], [59, 22, 9, 1],
      [75, 25, 9, 1], [29, 13, 9, 1], [54, 11, 11, 1], [10, 15, 8, 1], [72, 14, 9, 1],
      [40, 29, 3, 1], [46, 29, 3, 1], [3, 8, 6, 1], [81, 8, 6, 1],
    ],
    blocks: [[33, 23, 1, 3], [57, 16, 1, 3], [24, 27, 1, 3], [66, 26, 1, 2], [49, 7, 1, 4]],
    spawns: [[4, 31], [10, 24], [26, 20], [38, 25], [50, 18], [63, 21], [79, 24], [85, 31], [33, 12], [58, 10], [13, 14], [76, 13]],
    health: [[44, 33], [6, 7], [84, 7], [51, 18]],
    crates: [[18, 28], [30, 12], [60, 10], [70, 28], [8, 24], [80, 24]],
    bananas: [[24, 20], [64, 21], [8, 31], [46, 18], [81, 31]],
    theme: {
      sky: ['#6cb4e4', '#bfe3f0', '#d9eecf'],
      sun: { color: 'rgba(255,248,200,0.9)', radius: 46 },
      clouds: 'rgba(255,255,255,0.8)',
      layers: [
        { kind: 'mountains', speed: 0.08, base: 400, amp: 90, color: '#a9c9c4' },
        { kind: 'hills', speed: 0.15, base: 470, amp: 50, color: '#9cc7a4' },
        { kind: 'pines', speed: 0.3, base: 545, amp: 36, color: '#6f9f69' },
      ],
      ground: { body: '#7b5435', top: '#5fae3b', topEdge: '#4a8f2d' },
      platform: { body: '#6b4a2e', top: '#5fae3b', topEdge: '#4a8f2d' },
      block: { body: '#5d4128', top: '#6f8f3b', topEdge: '#55702c' },
      decor: ['bush', 'bush', 'palm', 'rock', 'flower'],
    },
  },

  // Sand dunes between two rock mesas, with concrete bunkers to duck under.
  desert: {
    id: 'desert',
    name: 'Desert Outpost',
    ground: (c) => {
      if (c <= 9) return 27;                         // west mesa
      if (c >= 80) return 27;                        // east mesa
      if (c >= 41 && c <= 48) return 34;             // dry riverbed
      return 31 + Math.round(1.5 * Math.sin(c / 6)) - bump(c, 52, 66, 2);
    },
    platforms: [
      [12, 22, 8, 1], [27, 18, 9, 1], [42, 14, 7, 1], [56, 18, 9, 1], [70, 22, 8, 1],
      [18, 11, 8, 1], [62, 11, 8, 1], [37, 27, 3, 1], [50, 27, 3, 1], [3, 19, 5, 1], [82, 19, 5, 1],
    ],
    blocks: [
      [22, 25, 8, 1], [22, 26, 1, 1], [29, 26, 1, 1],    // west bunker roof and lintels
      [32, 24, 1, 2],                                      // sandbag wall on the dune
      [45, 8, 1, 6],                                       // radio mast above the centre ledge
      [58, 23, 8, 1], [58, 24, 1, 1], [65, 24, 1, 1],    // east bunker
      [74, 28, 2, 1],
    ],
    spawns: [[4, 26], [14, 21], [25, 24], [31, 17], [44, 13], [60, 17], [72, 21], [85, 26], [20, 10], [65, 10], [5, 18], [84, 18]],
    health: [[44, 33], [38, 26], [51, 26], [26, 29]],
    crates: [[16, 21], [33, 17], [46, 13], [62, 22], [8, 26], [82, 26]],
    bananas: [[22, 10], [67, 10], [10, 31], [48, 33], [79, 31]],
    theme: {
      sky: ['#f3a55a', '#f8d59a', '#fbe9c4'],
      sun: { color: 'rgba(255,240,190,0.95)', radius: 58 },
      clouds: 'rgba(255,246,228,0.55)',
      layers: [
        { kind: 'mountains', speed: 0.06, base: 430, amp: 70, color: '#d9a877' },
        { kind: 'dunes', speed: 0.15, base: 500, amp: 34, color: '#e2b679' },
        { kind: 'dunes', speed: 0.3, base: 565, amp: 26, color: '#cf9a5c' },
      ],
      ground: { body: '#c99a5b', top: '#e8c483', topEdge: '#d2a764' },
      platform: { body: '#9b7653', top: '#b48c63', topEdge: '#8a6847' },
      block: { body: '#9a958c', top: '#b9b4aa', topEdge: '#7f7a72' },
      decor: ['cactus', 'rock', 'cactus', 'drybush', null],
    },
  },

  // A snowy mountain with a tunnel through its heart and slippery-looking ice ledges.
  snow: {
    id: 'snow',
    name: 'Snow Peak',
    ground: (c) => {
      if (c >= 8 && c <= 20) return 33;              // frozen lake
      if (c >= 70 && c <= 82) return 33;
      if (c >= 30 && c <= 60) return 31 - Math.round(10 * (1 - Math.abs(c - 45) / 15));
      return 31;
    },
    carve: [[35, 27, 21, 3]],                        // the tunnel under the summit
    platforms: [
      [5, 25, 6, 1], [15, 20, 8, 1], [25, 15, 8, 1], [41, 10, 9, 1], [57, 15, 8, 1],
      [67, 20, 8, 1], [79, 25, 6, 1], [6, 11, 6, 1], [78, 11, 6, 1], [12, 28, 4, 1], [74, 28, 4, 1],
    ],
    blocks: [[29, 21, 1, 3], [61, 21, 1, 3], [45, 5, 1, 5]],
    spawns: [[3, 30], [7, 24], [18, 19], [28, 14], [44, 9], [60, 14], [70, 19], [82, 24], [86, 30], [45, 20], [9, 10], [80, 10]],
    health: [[14, 32], [76, 32], [45, 29], [46, 9]],
    crates: [[13, 27], [76, 27], [40, 29], [50, 29], [27, 14], [62, 14]],
    bananas: [[38, 25], [52, 25], [8, 32], [28, 30], [82, 32]],
    theme: {
      sky: ['#8fb3d9', '#d4e3f2', '#eef4fb'],
      sun: { color: 'rgba(255,255,240,0.8)', radius: 40 },
      clouds: 'rgba(255,255,255,0.85)',
      snowfall: true,
      layers: [
        { kind: 'mountains', speed: 0.06, base: 380, amp: 120, color: '#b4c6dc', caps: '#f4f8fc' },
        { kind: 'mountains', speed: 0.14, base: 470, amp: 80, color: '#94aac4', caps: '#e8f0f8' },
        { kind: 'pines', speed: 0.3, base: 560, amp: 30, color: '#3f5d55' },
      ],
      ground: { body: '#6f7b88', top: '#f4f8fc', topEdge: '#d3e1ee' },
      platform: { body: '#9fd6ec', top: '#d9f3fb', topEdge: '#7cc1de', ice: true },
      block: { body: '#59626d', top: '#f4f8fc', topEdge: '#d3e1ee' },
      decor: ['pine', 'pine', 'rock', 'snowman', null],
    },
  },

  // A floodlit military base at night: steel decks, crate stacks and lamp posts.
  night: {
    id: 'night',
    name: 'Night Base',
    ground: (c) => (c >= 42 && c <= 47 ? 34 : 32),
    platforms: [
      [28, 26, 14, 1], [48, 26, 14, 1], [34, 20, 9, 1], [47, 20, 9, 1], [40, 13, 10, 1],
      [4, 22, 8, 1], [78, 22, 8, 1], [14, 15, 8, 1], [68, 15, 8, 1], [3, 9, 6, 1], [81, 9, 6, 1],
      [21, 25, 4, 1], [65, 25, 4, 1],
    ],
    blocks: [
      [28, 27, 1, 5], [61, 27, 1, 5],                      // deck supports
      [10, 30, 2, 2], [12, 31, 1, 1], [77, 30, 2, 2], [76, 31, 1, 1],   // crate stacks
      [38, 17, 1, 3], [51, 17, 1, 3], [44, 9, 1, 4],
    ],
    spawns: [[3, 31], [7, 21], [17, 14], [31, 25], [36, 19], [53, 19], [58, 25], [72, 14], [82, 21], [86, 31], [5, 8], [83, 8]],
    health: [[44, 33], [45, 12], [35, 31], [55, 31]],
    crates: [[11, 29], [78, 29], [23, 24], [66, 24], [41, 12], [48, 12]],
    bananas: [[6, 8], [84, 8], [16, 31], [48, 19], [74, 31]],
    theme: {
      sky: ['#070b1e', '#16204a', '#2b2f5c'],
      moon: { color: 'rgba(235,240,255,0.92)', radius: 34 },
      stars: true,
      clouds: 'rgba(120,130,170,0.25)',
      layers: [
        { kind: 'mountains', speed: 0.05, base: 420, amp: 80, color: '#1a2142' },
        { kind: 'city', speed: 0.12, base: 520, amp: 150, color: '#141a36', windows: 'rgba(255,214,120,0.75)' },
        { kind: 'hills', speed: 0.3, base: 590, amp: 22, color: '#0e1328' },
      ],
      ground: { body: '#3a3f4b', top: '#5a6170', topEdge: '#2b2f39' },
      platform: { body: '#4b5466', top: '#8a94a8', topEdge: '#f2c14e', metal: true },
      block: { body: '#5a4a32', top: '#6e5b3e', topEdge: '#3f3322', crate: true },
      decor: ['lamp', null, 'barrel', null, 'lamp', 'antenna'],
      night: true,
    },
  },
};

export const MAP_IDS = Object.keys(MAPS);
export const mapName = (id) => MAPS[id]?.name ?? MAPS.jungle.name;
export const randomMapId = (rng = Math.random) => MAP_IDS[Math.floor(rng() * MAP_IDS.length) % MAP_IDS.length];
