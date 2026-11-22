// Repository layer: MongoDB queries for saved match replays.

const crypto = require('node:crypto');
const { cleanRoster, cleanLog, text } = require('../models/match');
const { isId, oid } = require('./rows');

// Name shown in old matches after a player deletes their account.
const DELETED = 'Deleted soldier';

/**
 * Turns a match document into the JSON sent to the browser. Real user IDs are
 * removed; the viewer's own row is marked with me: true instead.
 * @param {object} doc match document
 * @param {string|null} userId the viewer
 */
function publicMatch(doc, userId = null) {
  return {
    matchId: doc.matchId, mode: doc.mode, multiplayer: !!doc.multiplayer, map: doc.map ?? '', difficulty: doc.difficulty,
    durationS: doc.durationS ?? 0, teamMode: !!doc.teamMode, winner: doc.winner ?? null, createdAt: doc.createdAt,
    roster: (doc.roster ?? []).map(({ userId: uid, ...r }) => ({ ...r, ...(userId && uid && String(uid) === String(userId) ? { me: true } : {}) })),
    log: doc.log ?? [],
  };
}

/**
 * Creates the match repository.
 * @param {object} m the Mongoose models
 */
function createMatchRepository(m) {
  return {
    /**
     * Saves a match. Roster and log are cleaned first (see models/match.js)
     * and the duration is clamped to 0..3600 seconds.
     * @returns {Promise<string>} the matchId
     */
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
    /**
     * Loads one match, but only if this user played in it (has a score with
     * that matchId) or is an admin. Otherwise returns null, so players cannot
     * read other people's replays by guessing IDs.
     */
    async matchForUser(matchId, userId, isAdmin = false) {
      if (typeof matchId !== 'string' || !matchId || matchId.length > 64 || !isId(userId)) return null;
      if (!isAdmin && !(await m.Score.exists({ matchId, user: oid(userId) }))) return null;
      const doc = await m.Match.findOne({ matchId }).lean();
      return doc ? publicMatch(doc, userId) : null;
    },
    /** Lists all matches this user has a score in, newest first. */
    async matchesForUser(userId) {
      if (!isId(userId)) return [];
      const ids = await m.Score.distinct('matchId', { user: oid(userId), matchId: { $type: 'string' } });
      return (await m.Match.find({ matchId: { $in: ids } }).sort({ createdAt: -1 }).lean()).map((d) => publicMatch(d, userId));
    },
    /**
     * Updates the player's name inside old matches after a username change.
     * arrayFilters change only the roster/log entries that belong to this player.
     */
    async renamePlayerInMatches(userId, from, to) {
      if (!isId(userId) || !from || !to || from === to) return;
      const uid = oid(userId);
      await m.Match.updateMany({ 'roster.userId': uid, winner: from }, { $set: { winner: to } });
      await m.Match.updateMany(
        { 'roster.userId': uid },
        { $set: { 'roster.$[r].name': to, 'log.$[a].by': to, 'log.$[b].target': to } },
        { arrayFilters: [{ 'r.userId': uid }, { 'a.by': from }, { 'b.target': from }] },
      );
    },
    /**
     * Removes a deleted player from matches (privacy): deletes matches they own
     * and replaces their name with "Deleted soldier" in other people's matches.
     */
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
