// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { badRequest, forbidden } = require('../lib/errors');
const { cleanPowers } = require('./achievements');
const { CHAPTERS, MISSIONS, missionById, isUnlocked, starsFor, totalStars, chapterOf } = require('../../client/src/game/campaign.js');

const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

function createCampaignService({ db, achievements }) {
  async function overview(userId) {
    const progress = await db.campaignProgress(userId);
    return { chapters: CHAPTERS, missions: MISSIONS, progress, stars: totalStars(progress) };
  }

  async function finishMission(userId, b, tally) {
    const mission = missionById(b.mission);
    const kills = int(b.kills, 200);
    const deaths = int(b.deaths, 200);
    const continues = int(b.continues, 20);
    const timeS = int(b.timeS, 3600);
    if (!mission || [kills, deaths, continues, timeS].includes(null)) throw badRequest('Send mission, kills, deaths, continues and timeS');
    const before = await db.campaignProgress(userId);
    if (!isUnlocked(mission, before)) throw forbidden('That mission is still locked');

    const won = !!b.won && kills >= mission.target;
    const p = tally.take();
    const stars = starsFor({ won, continues, puzzlesSolved: p.solved, puzzlesAttempted: p.attempted });

    const progress = await db.saveMission(userId, mission.id, stars, timeS);
    await db.addScore({
      userId, mode: 'campaign', difficulty: chapterOf(mission).difficulty, kills, deaths, won,
      puzzlesSolved: p.solved, puzzlesAttempted: p.attempted, durationS: timeS,
    });
    const next = missionById(mission.id + 1);
    const unlocked = await achievements.emit('mission:finished', userId, { mission: mission.id, stars });
    const powers = cleanPowers(b.powers);
    if (powers.length) unlocked.push(...await achievements.emit('power:used', userId, { powers }));
    return {
      stars, best: progress[mission.id].stars, progress, totalStars: totalStars(progress),
      unlockedNext: !!next && !isUnlocked(next, before) && isUnlocked(next, progress), unlocked,
    };
  }

  return { overview, finishMission };
}

module.exports = { createCampaignService };
