// Service layer: achievements and the game event bus (event-driven programming theme).
// Services emit events such as 'score:saved'; rules listen for them and unlock badges.

const { EventEmitter } = require('node:events');

// The list of every achievement the player can earn.
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
  { id: 'power_hungry', name: 'Power Hungry', text: 'Use all five Banana Powers.' },
  { id: 'three_stars', name: 'Three Stars', text: 'Earn 3 stars on a campaign mission.' },
  { id: 'campaign_clear', name: 'Campaign Hero', text: 'Complete the final campaign mission.' },
  { id: 'banana_brain', name: 'Banana Brain', text: 'Solve 5 Banana puzzles in a row.' },
  { id: 'speed_demon', name: 'Speed Demon', text: 'Solve a Banana puzzle in under 3 seconds.' },
  { id: 'clutch', name: 'Clutch', text: 'Solve a respawn or crate puzzle with 3 seconds or less left.' },
  { id: 'crate_collector', name: 'Crate Collector', text: 'Open 10 banana crates.' },
  { id: 'daily_warrior', name: 'Daily Warrior', text: 'Finish the Daily Banana Challenge 3 days in a row.' },
  { id: 'perfect_day', name: 'Perfect Day', text: 'Solve all 5 daily puzzles.' },
];
const { POWERS } = require('../../client/src/game/config.js');
const POWER_IDS = Object.keys(POWERS);
const POWER_COUNT = POWER_IDS.length;
// Keeps only real power-up names and removes duplicates (validation of client input).
const cleanPowers = (list) => (Array.isArray(list) ? [...new Set(list.filter((p) => POWER_IDS.includes(p)))] : []);
const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
// Seconds allowed per puzzle type, used for the "Clutch" achievement.
const LIMITS = { deploy: 30, respawn: 15, crate: 20, daily: 20 };

/**
 * Creates the achievements system.
 * @param {object} deps db (repositories)
 * @returns {{emit, events, list, forPlayer}} events is the EventEmitter other code can listen to
 */
function createAchievements({ db }) {
  const events = new EventEmitter();
  const rules = [];
  // rule(eventName, check) registers a handler: check() returns the achievement ids earned.
  const rule = (eventName, check) => rules.push([eventName, check]);

  // Handler for 'score:saved': kill, wave and win based achievements.
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

  // Handler for 'puzzle:answered': puzzle streak, speed and crate achievements.
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

  // Handler for 'mission:finished': campaign achievements (mission 9 is the last).
  rule('mission:finished', async (userId, r) => {
    const ids = [];
    if (r.stars === 3) ids.push('three_stars');
    if (r.stars > 0 && r.mission === 9) ids.push('campaign_clear');
    return ids;
  });

  // Handler for 'power:used': unlock when all five powers have been used.
  rule('power:used', async (userId, { powers }) => {
    const all = await db.addPowersUsed(userId, powers);
    return all.length >= POWER_COUNT ? ['power_hungry'] : [];
  });

  // Handler for 'daily:finished': daily challenge streak and perfect score.
  rule('daily:finished', async (userId, d) => {
    const ids = [];
    if (d.streak >= 3) ids.push('daily_warrior');
    if (d.solved === d.total) ids.push('perfect_day');
    return ids;
  });

  /**
   * Fires a game event. First tells every listener on the EventEmitter (e.g. the
   * live activity feed), then runs the matching rules and saves new achievements.
   * @param {string} eventName e.g. 'score:saved'
   * @param {string} userId the player
   * @param {object} data event details
   * @returns {Promise<Array>} achievements unlocked by this event (shown as pop-ups)
   */
  async function emit(eventName, userId, data) {
    events.emit(eventName, userId, data);
    const unlocked = [];
    for (const [name, check] of rules) {
      if (name !== eventName) continue;
      for (const id of await check(userId, data)) {
        // unlockAchievement returns false if the player already had it, so it is only announced once.
        if (await db.unlockAchievement(userId, id)) unlocked.push(BY_ID.get(id));
      }
    }
    // A second event, so the activity feed can show the unlock too.
    for (const a of unlocked) events.emit('achievement:unlocked', userId, a);
    return unlocked;
  }

  /** All achievements plus the ones this player has unlocked. */
  async function forPlayer(userId) {
    const user = await db.findUserById(userId);
    return { all: ACHIEVEMENTS, mine: user?.achievements ?? [] };
  }

  return { emit, events, list: ACHIEVEMENTS, forPlayer };
}

module.exports = { createAchievements, ACHIEVEMENTS, cleanPowers };
