// Campaign progress. The mission table (client/src/game/campaign.js) is shared with
// the browser, but unlocking and stars are decided here: a mission that is still
// locked for this player is refused, and the "every puzzle solved" star uses the
// puzzle counts kept in the session, where every answer was checked by the server.
//
//   GET  /api/campaign          -> { chapters, missions, progress, stars }
//   POST /api/campaign/result   { mission, won, kills, deaths, continues, timeS }
//                               -> { stars, best, progress, unlockedNext, unlocked }
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const { requireLogin } = require('../middleware/auth');
const { cleanPowers } = require('../achievements');
const { CHAPTERS, MISSIONS, missionById, isUnlocked, starsFor, totalStars, chapterOf } = require('../../client/src/game/campaign.js');

const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);

function createCampaignRouter({ db, achievements }) {
  const router = express.Router();
  router.use(requireLogin);

  router.get('/', async (req, res, next) => {
    try {
      const progress = await db.campaignProgress(req.session.userId);
      res.json({ chapters: CHAPTERS, missions: MISSIONS, progress, stars: totalStars(progress) });
    } catch (err) { next(err); }
  });

  router.post('/result', async (req, res, next) => {
    try {
      const b = req.body ?? {};
      const mission = missionById(b.mission);
      const kills = int(b.kills, 200);
      const deaths = int(b.deaths, 200);
      const continues = int(b.continues, 20);
      const timeS = int(b.timeS, 3600);
      if (!mission || [kills, deaths, continues, timeS].includes(null)) return res.status(400).json({ error: 'Send mission, kills, deaths, continues and timeS' });
      const before = await db.campaignProgress(req.session.userId);
      if (!isUnlocked(mission, before)) return res.status(403).json({ error: 'That mission is still locked' });

      const won = !!b.won && kills >= mission.target;               // a win needs the target reached
      const p = req.session.puzzles ?? { solved: 0, attempted: 0 };
      const stars = starsFor({ won, continues, puzzlesSolved: p.solved, puzzlesAttempted: p.attempted });
      req.session.puzzles = { solved: 0, attempted: 0 };

      const progress = await db.saveMission(req.session.userId, mission.id, stars, timeS);
      await db.addScore({
        userId: req.session.userId, mode: 'campaign', difficulty: chapterOf(mission).difficulty, kills, deaths, won,
        puzzlesSolved: p.solved, puzzlesAttempted: p.attempted, durationS: timeS,
      });
      const next = missionById(mission.id + 1);
      const unlocked = await achievements.emit('mission:finished', req.session.userId, { mission: mission.id, stars });
      const powers = cleanPowers(b.powers);
      if (powers.length) unlocked.push(...await achievements.emit('power:used', req.session.userId, { powers }));
      res.json({
        stars, best: progress[mission.id].stars, progress, totalStars: totalStars(progress),
        unlockedNext: !!next && !isUnlocked(next, before) && isUnlocked(next, progress), unlocked,
      });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = { createCampaignRouter };
