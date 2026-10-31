// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { scoreRow, isId, oid } = require('./rows');

const HISTORY_FILTERS = {
  all: {}, solo: { multiplayer: false }, online: { multiplayer: true },
  quick: { mode: 'quick' }, survival: { mode: 'survival' }, team: { mode: 'team' }, campaign: { mode: 'campaign' },
};
const encodeCursor = (s) => `${new Date(s.createdAt).getTime()}_${s._id}`;
function decodeCursor(cursor) {
  const [, ms, id] = /^(\d{1,15})_([0-9a-f]{24})$/.exec(String(cursor ?? '')) ?? [];
  return ms ? { at: new Date(Number(ms)), id: oid(id) } : null;
}
const humans = [
  { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u', pipeline: [{ $project: { username: 1, guest: 1 } }] } },
  { $match: { 'u.0': { $exists: true }, 'u.guest': { $ne: true } } },
  { $set: { username: { $first: '$u.username' } } },
  { $unset: 'u' },
];
const ranked = (sortBy, limit, userId) => [
  { $sort: sortBy },
  { $group: { _id: null, all: { $push: '$$ROOT' } } },
  { $unwind: { path: '$all', includeArrayIndex: 'i' } },
  { $replaceWith: { $mergeObjects: ['$all', { rank: { $add: ['$i', 1] } }] } },
  { $facet: { top: [{ $limit: limit }], me: [{ $match: { _id: userId && isId(userId) ? oid(userId) : null } }] } },
];
const withMatch = { $lookup: { from: 'matches', localField: 'matchId', foreignField: 'matchId', as: 'm', pipeline: [{ $project: { _id: 1 } }] } };
const historyRow = ({ m: found, ...s }) => ({ ...scoreRow(s), hasLog: found.length > 0 });
const careerRow = (r) => ({
  rank: r.rank, username: r.username, kills: r.kills, deaths: r.deaths, wave: r.wave, wins: r.wins, games: r.games,
  puzzles_solved: r.puzzlesSolved, puzzles_attempted: r.puzzlesAttempted,
});
const bestRow = (r) => {
  const { id, matchId, ...best } = scoreRow(r.best);
  return { ...best, username: r.username, rank: r.rank, wins: r.wins, games: r.games };
};

function createScoreRepository(m) {
  return {
    async addScore(s) {
      const doc = await m.Score.create({
        user: oid(s.userId), mode: s.mode, difficulty: s.difficulty ?? 'medium', kills: s.kills, deaths: s.deaths, wave: s.wave ?? 0,
        won: !!s.won && !s.draw, draw: !!s.draw, map: typeof s.map === 'string' ? s.map.slice(0, 40) : '',
        puzzlesSolved: s.puzzlesSolved ?? 0, puzzlesAttempted: s.puzzlesAttempted ?? 0, durationS: s.durationS ?? 0,
        matchId: s.matchId, multiplayer: !!s.multiplayer,
      });
      return String(doc._id);
    },
    async leaderboard(mode, limit = 20, since = null, { by = 'best', userId = null } = {}) {
      const match = { $match: { ...(mode === 'all' ? { mode: { $ne: 'training' } } : { mode }), ...(since ? { createdAt: { $gte: since } } : {}) } };
      if (by === 'career') {
        const [{ top, me }] = await m.Score.aggregate([
          match,
          { $group: {
            _id: '$user', games: { $sum: 1 }, wins: { $sum: { $cond: ['$won', 1, 0] } }, kills: { $sum: '$kills' }, deaths: { $sum: '$deaths' },
            wave: { $max: '$wave' }, puzzlesSolved: { $sum: '$puzzlesSolved' }, puzzlesAttempted: { $sum: '$puzzlesAttempted' },
          } },
          ...humans,
          ...ranked({ wins: -1, kills: -1, games: 1, _id: 1 }, limit, userId),
        ]);
        return { rows: top.map(careerRow), me: me[0] ? careerRow(me[0]) : null };
      }
      const order = mode === 'survival' ? { wave: -1, kills: -1 } : { kills: -1, puzzlesSolved: -1 };
      const [{ top, me }] = await m.Score.aggregate([
        match,
        { $sort: { ...order, createdAt: 1, _id: 1 } },
        { $group: { _id: '$user', best: { $first: '$$ROOT' }, games: { $sum: 1 }, wins: { $sum: { $cond: ['$won', 1, 0] } } } },
        ...humans,
        ...ranked(Object.fromEntries([...Object.entries(order).map(([k, v]) => [`best.${k}`, v]), ['best.createdAt', 1], ['_id', 1]]), limit, userId),
      ]);
      return { rows: top.map(bestRow), me: me[0] ? bestRow(me[0]) : null };
    },
    async history(userId, { filter = 'all', before = null, limit = 20 } = {}) {
      if (!isId(userId)) return { rows: [], next: null };
      const cursor = decodeCursor(before);
      const rows = await m.Score.aggregate([
        { $match: {
          user: oid(userId), mode: { $ne: 'training' }, ...(HISTORY_FILTERS[filter] ?? {}),
          ...(cursor ? { $or: [{ createdAt: { $lt: cursor.at } }, { createdAt: cursor.at, _id: { $lt: cursor.id } }] } : {}),
        } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: limit + 1 },
        withMatch,
      ]);
      const page = rows.slice(0, limit);
      return {
        rows: page.map(historyRow),
        next: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
      };
    },
    async scoresForUser(userId, limit = 20) {
      const rows = await m.Score.aggregate([
        { $match: { user: oid(userId) } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: limit },
        withMatch,
      ]);
      return rows.map(historyRow);
    },
    async totalsForUser(userId) {
      const [t] = await m.Score.aggregate([
        { $match: { user: oid(userId) } },
        { $group: {
          _id: null, games: { $sum: 1 }, kills: { $sum: '$kills' }, deaths: { $sum: '$deaths' },
          best_wave: { $max: '$wave' }, best_kills: { $max: '$kills' }, wins: { $sum: { $cond: ['$won', 1, 0] } },
          seconds_played: { $sum: '$durationS' }, puzzles_solved: { $sum: '$puzzlesSolved' }, puzzles_attempted: { $sum: '$puzzlesAttempted' },
        } },
      ]);
      const zero = { games: 0, kills: 0, deaths: 0, best_wave: 0, best_kills: 0, wins: 0, seconds_played: 0, puzzles_solved: 0, puzzles_attempted: 0 };
      if (!t) return zero;
      delete t._id;
      return { ...zero, ...t };
    },
    async deleteScoresForUser(userId) {
      if (!isId(userId)) return 0;
      await m.Match.deleteMany({ owner: oid(userId) });
      return (await m.Score.deleteMany({ user: oid(userId) })).deletedCount;
    },
  };
}

module.exports = { createScoreRepository, HISTORY_FILTERS };
