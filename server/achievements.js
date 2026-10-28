// Achievements: badges that unlock when something happens in the game.
//
// This is event-driven on the server: the puzzle route, the score route, online
// matches and the daily challenge only announce what happened on `events`
// (puzzle:answered, score:saved, daily:finished). The achievement rules listen and
// unlock badges; the code that announced the event does not know they exist.
// Unlocks are written once per player (see db.unlockAchievement), and every check
// uses numbers the server worked out itself, so badges cannot be faked.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { EventEmitter } = require('node:events');

const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', text: 'Get a kill in a saved battle.' },
  { id: 'sharpshooter', name: 'Sharpshooter', text: '10 kills in one battle.' },
  { id: 'rampage', name: 'Banana Rampage', text: '20 kills in one battle.' },
  { id: 'survivor', name: 'Survivor', text: 'Reach wave 5 in Survival.' },
  { id: 'iron_will', name: 'Iron Will', text: 'Reach wave 10 in Survival.' },
  { id: 'team_player', name: 'Team Player', text: 'Win a Team Battle.' },
  { id: 'online_victor', name: 'Online Victor', text: 'Win an online match against real players.' },
  { id: 'veteran', name: 'Veteran', text: 'Finish 25 battles.' },
  { id: 'hard_win', name: 'Hard as Nails', text: 'Win a battle on Hard.' },
  { id: 'three_stars', name: 'Three Stars', text: 'Earn 3 stars on a campaign mission.' },
  { id: 'campaign_clear', name: 'Campaign Hero', text: 'Complete the final campaign mission.' },
  { id: 'banana_brain', name: 'Banana Brain', text: 'Solve 5 Banana puzzles in a row.' },
  { id: 'speed_demon', name: 'Speed Demon', text: 'Solve a Banana puzzle in under 3 seconds.' },
  { id: 'clutch', name: 'Clutch', text: 'Solve a respawn or crate puzzle with 3 seconds or less left.' },
  { id: 'crate_collector', name: 'Crate Collector', text: 'Open 10 banana crates.' },
  { id: 'daily_warrior', name: 'Daily Warrior', text: 'Finish the Daily Banana Challenge 3 days in a row.' },
  { id: 'perfect_day', name: 'Perfect Day', text: 'Solve all 5 daily puzzles.' },
];
const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
const LIMITS = { deploy: 30, respawn: 15, crate: 20, daily: 20 };   // seconds per puzzle (client PUZZLE_RULES, daily route)

function createAchievements({ db }) {
  const events = new EventEmitter();
  const rules = [];   // [eventName, async (userId, data) => [achievement ids]]
  const rule = (eventName, check) => rules.push([eventName, check]);

  rule('score:saved', async (userId, s) => {
    const ids = [];
    if (s.kills >= 1) ids.push('first_blood');
    if (s.kills >= 10) ids.push('sharpshooter');
    if (s.kills >= 20) ids.push('rampage');
    if (s.mode === 'survival' && s.wave >= 5) ids.push('survivor');
    if (s.mode === 'survival' && s.wave >= 10) ids.push('iron_will');
    if (s.won && (s.mode === 'team' || (s.mode === 'online' && s.teamMode))) ids.push('team_player');
    if (s.won && s.mode === 'online') ids.push('online_victor');
    if (s.won && s.difficulty === 'hard') ids.push('hard_win');
    if ((await db.totalsForUser(userId)).games >= 25) ids.push('veteran');
    return ids;
  });

  rule('puzzle:answered', async (userId, p) => {
    const counters = await db.recordPuzzle(userId, { correct: p.correct, crate: p.purpose === 'crate' && p.correct });
    const ids = [];
    if (counters.streak >= 5) ids.push('banana_brain');
    if (p.correct && p.ms < 3000) ids.push('speed_demon');
    const left = (LIMITS[p.purpose] ?? 30) - p.ms / 1000;
    if (p.correct && p.purpose !== 'deploy' && left <= 3) ids.push('clutch');
    if (counters.crates >= 10) ids.push('crate_collector');
    return ids;
  });

  rule('mission:finished', async (userId, r) => {
    const ids = [];
    if (r.stars === 3) ids.push('three_stars');
    if (r.stars > 0 && r.mission === 9) ids.push('campaign_clear');
    return ids;
  });

  rule('daily:finished', async (userId, d) => {
    const ids = [];
    if (d.streak >= 3) ids.push('daily_warrior');
    if (d.solved === d.total) ids.push('perfect_day');
    return ids;
  });

  // Announce an event; resolves to the achievements this event newly unlocked.
  async function emit(eventName, userId, data) {
    events.emit(eventName, userId, data);
    const unlocked = [];
    for (const [name, check] of rules) {
      if (name !== eventName) continue;
      for (const id of await check(userId, data)) {
        if (await db.unlockAchievement(userId, id)) unlocked.push(BY_ID.get(id));
      }
    }
    for (const a of unlocked) events.emit('achievement:unlocked', userId, a);
    return unlocked;
  }

  return { emit, events, list: ACHIEVEMENTS };
}

module.exports = { createAchievements, ACHIEVEMENTS };
