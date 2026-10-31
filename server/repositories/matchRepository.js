// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const { cleanRoster, cleanLog, text } = require('../models/match');
const { isId, oid } = require('./rows');

const DELETED = 'Deleted soldier';

function publicMatch(doc, userId = null) {
  return {
    matchId: doc.matchId, mode: doc.mode, multiplayer: !!doc.multiplayer, map: doc.map ?? '', difficulty: doc.difficulty,
    durationS: doc.durationS ?? 0, teamMode: !!doc.teamMode, winner: doc.winner ?? null, createdAt: doc.createdAt,
    roster: (doc.roster ?? []).map(({ userId: uid, ...r }) => ({ ...r, ...(userId && uid && String(uid) === String(userId) ? { me: true } : {}) })),
    log: doc.log ?? [],
  };
}

function createMatchRepository(m) {
  return {
    async addMatch(x) {
      const owner = x.owner && isId(x.owner) ? oid(x.owner) : null;
      const roster = cleanRoster(x.roster).map(({ me, userId, ...r }) => {
        const uid = userId && isId(userId) ? oid(userId) : (me && owner ? owner : null);
        return uid ? { ...r, userId: uid } : r;
      });
      const doc = await m.Match.create({
        matchId: typeof x.matchId === 'string' && x.matchId ? x.matchId.slice(0, 64) : crypto.randomUUID(),
        mode: x.mode, multiplayer: !!x.multiplayer, map: text(x.map) ?? '', difficulty: x.difficulty ?? 'medium',
        durationS: Math.min(3600, Math.max(0, Math.round(Number(x.durationS) || 0))), teamMode: !!x.teamMode,
        winner: text(x.winner) || null, roster, log: cleanLog(x.log), owner,
      });
      return doc.matchId;
    },
    async matchForUser(matchId, userId, isAdmin = false) {
      if (typeof matchId !== 'string' || !matchId || matchId.length > 64 || !isId(userId)) return null;
      if (!isAdmin && !(await m.Score.exists({ matchId, user: oid(userId) }))) return null;
      const doc = await m.Match.findOne({ matchId }).lean();
      return doc ? publicMatch(doc, userId) : null;
    },
    async matchesForUser(userId) {
      if (!isId(userId)) return [];
      const ids = await m.Score.distinct('matchId', { user: oid(userId), matchId: { $type: 'string' } });
      return (await m.Match.find({ matchId: { $in: ids } }).sort({ createdAt: -1 }).lean()).map((d) => publicMatch(d, userId));
    },
    async forgetPlayerInMatches(userId, username) {
      if (!isId(userId)) return;
      const uid = oid(userId);
      await m.Match.deleteMany({ owner: uid });
      if (username) await m.Match.updateMany({ 'roster.userId': uid, winner: username }, { $set: { winner: DELETED } });
      await m.Match.updateMany(
        { 'roster.userId': uid },
        { $set: { 'roster.$[r].name': DELETED, ...(username ? { 'log.$[a].by': DELETED, 'log.$[b].target': DELETED } : {}) }, $unset: { 'roster.$[r].userId': '' } },
        { arrayFilters: [{ 'r.userId': uid }, ...(username ? [{ 'a.by': username }, { 'b.target': username }] : [])] },
      );
    },
  };
}

module.exports = { createMatchRepository, publicMatch, DELETED };
