// rank.js: the military ranks and the XP needed for each one.
export const RANKS = [
  { name: 'Recruit', xp: 0 },
  { name: 'Private', xp: 500 },
  { name: 'Corporal', xp: 1500 },
  { name: 'Sergeant', xp: 3500 },
  { name: 'Lieutenant', xp: 7000 },
  { name: 'Captain', xp: 12000 },
  { name: 'Major', xp: 20000 },
  { name: 'Colonel', xp: 32000 },
  { name: 'General', xp: 50000 },
  { name: 'Banana Marshal', xp: 80000 },
];

/** xpFor: XP from career totals: 10 per kill, 25 per solved puzzle, 100 per win. */
export const xpFor = (t) => (t.kills ?? 0) * 10 + (t.puzzles_solved ?? 0) * 25 + (t.wins ?? 0) * 100;

/**
 * rankFor: find the rank for an XP total.
 * @returns {{name: string, xp: number, floor: number, next: number|null}} rank name, XP,
 *   XP where this rank starts, and XP for the next rank (null at the top rank).
 */
export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1];
  return { name: RANKS[i].name, xp, floor: RANKS[i].xp, next: next?.xp ?? null };
}

// Mode id -> name shown to the player.
export const MODE_NAMES = { quick: 'Quick Play', survival: 'Survival', training: 'Training', team: 'Team Battle', online: 'Online', campaign: 'Campaign' };
