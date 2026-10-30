// The Campaign: 9 missions in 3 chapters. Each mission is one row of this table, so
// adding or tuning a level means editing data, not code (both the browser and the
// server read this file). Each mission is fought on one fixed map from maps.js.
//
// A mission is won by reaching the kill target before the time runs out. You have a
// number of lives; when they are gone you can solve one Banana puzzle to continue.
// Stars:  ★ mission complete
//         ★★ without needing a Banana continue
//         ★★★ and every Banana puzzle in the mission solved
// The next mission unlocks when the previous one is complete; chapters also need stars.
// Bots get a little sharper every minute inside a mission.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

export const CHAPTERS = [
  { id: 1, name: 'Boot Camp', needStars: 0, difficulty: 'easy' },
  { id: 2, name: 'Jungle Front', needStars: 6, difficulty: 'medium' },
  { id: 3, name: 'Banana Storm', needStars: 15, difficulty: 'hard' },
];

export const MISSIONS = [
  { id: 1, chapter: 1, name: 'First Flight', map: 'jungle', text: 'Learn the jetpack against two rookies.', bots: 2, target: 5, timeLimit: 240, lives: 5 },
  { id: 2, chapter: 1, name: 'Jetpack Jump', map: 'jungle', text: 'Three bots, high platforms.', bots: 3, target: 8, timeLimit: 240, lives: 5 },
  { id: 3, chapter: 1, name: 'Crate Run', map: 'jungle', text: 'Open banana crates for Banana Powers.', bots: 3, target: 10, timeLimit: 240, lives: 4 },
  { id: 4, chapter: 2, name: 'Ambush', map: 'desert', text: 'Four sharper bots.', bots: 4, target: 10, timeLimit: 210, lives: 4 },
  { id: 5, chapter: 2, name: 'Crossfire', map: 'desert', text: 'Five bots, keep moving.', bots: 5, target: 12, timeLimit: 210, lives: 4 },
  { id: 6, chapter: 2, name: 'Hold the Ridge', map: 'desert', text: 'Fewer lives, more kills.', bots: 5, target: 15, timeLimit: 210, lives: 3 },
  { id: 7, chapter: 3, name: 'Night Raid', map: 'night', text: 'Hard bots and short puzzle timers.', bots: 5, target: 15, timeLimit: 180, lives: 3 },
  { id: 8, chapter: 3, name: 'Last Stand', map: 'snow', text: 'Six hard bots.', bots: 6, target: 18, timeLimit: 180, lives: 3 },
  { id: 9, chapter: 3, name: 'Banana Marshal', map: 'night', text: 'The final test: seven bots, two lives.', bots: 7, target: 20, timeLimit: 180, lives: 2 },
];

export const RAMP = { every: 60, accuracy: 0.05, reaction: 0.9 };   // per minute inside a mission

export const missionById = (id) => MISSIONS.find((m) => m.id === id) ?? null;
export const chapterOf = (mission) => CHAPTERS.find((c) => c.id === mission.chapter);

// progress: { [missionId]: { stars, bestS } }
export const totalStars = (progress) => Object.values(progress ?? {}).reduce((n, p) => n + (p.stars ?? 0), 0);

export function isUnlocked(mission, progress) {
  if (mission.id === 1) return true;
  const previousDone = (progress?.[mission.id - 1]?.stars ?? 0) > 0;
  return previousDone && totalStars(progress) >= chapterOf(mission).needStars;
}

export function starsFor({ won, continues, puzzlesSolved, puzzlesAttempted }) {
  if (!won) return 0;
  let stars = 1;
  if (continues === 0) stars += 1;
  if (continues === 0 && puzzlesAttempted > 0 && puzzlesSolved === puzzlesAttempted) stars += 1;
  return stars;
}
