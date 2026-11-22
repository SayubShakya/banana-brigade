// Service layer: saving and reading match replays (roster + timeline).

const { badRequest, notFound } = require('../lib/errors');
const { cleanRoster, cleanLog, text } = require('../models/match');
const { HISTORY_FILTERS } = require('../repositories/scoreRepository');

// Makes sure at most one roster row is marked as "me".
const oneMe = (rows) => rows.map((r, i) => (r.me && rows.findIndex((x) => x.me) !== i ? (({ me, ...rest }) => rest)(r) : r));

/**
 * Validates and cleans the optional match data sent with a score.
 * @param {object} b request body (roster, log, map, draw)
 * @returns {{wanted, map, draw, roster, log}} wanted is true if the client sent a roster or log
 * @throws 400 if roster/log is not a list, map is not text, or draw is not true/false
 */
function parseMatchInput(b) {
  for (const k of ['roster', 'log']) if (b[k] !== undefined && b[k] !== null && !Array.isArray(b[k])) throw badRequest(`${k} must be a list`);
  if (b.map !== undefined && b.map !== null && typeof b.map !== 'string') throw badRequest('map must be text');
  if (b.draw !== undefined && typeof b.draw !== 'boolean') throw badRequest('draw must be true or false');
  return {
    wanted: Array.isArray(b.roster) || Array.isArray(b.log),
    // userId is stripped: the browser is never allowed to link a row to a real account.
    map: text(b.map) ?? '', draw: b.draw === true, roster: oneMe(cleanRoster(b.roster).map(({ userId, ...r }) => r)), log: cleanLog(b.log),
  };
}

/**
 * Works out who won a solo match from the roster.
 * @returns {string|null} a player name, a team ('blue'/'red'), or null for no winner/draw
 */
function soloWinner(game, roster, teamMode, draw) {
  const me = roster.find((r) => r.me);
  if (draw || game.mode === 'survival') return null;
  if (game.mode === 'campaign') return game.won ? me?.name ?? null : null;
  if (teamMode) {
    const sum = (team) => roster.reduce((n, r) => n + (r.team === team ? r.kills : 0), 0);
    const [blue, red] = [sum('blue'), sum('red')];
    if (game.won && me?.team) return me.team;
    return blue === red ? null : blue > red ? 'blue' : 'red';
  }
  if (game.won) return me?.name ?? null;
  const top = roster.filter((r) => r !== me).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
  return top?.kills > 0 ? top.name : null;
}

/**
 * Creates the match service.
 * @param {object} deps db (repositories)
 */
function createMatchService({ db }) {
  /**
   * Saves the replay for a single-player game, if the client sent match data.
   * @returns {Promise<string|null>} matchId, or null when nothing was sent
   */
  async function saveSolo(userId, game, input) {
    if (!input.wanted) return null;
    let { roster } = input;
    if (!roster.length) {
      const user = await db.findUserById(userId);
      roster = [{ name: user?.username ?? 'You', kills: game.kills, deaths: game.deaths, bot: false, me: true }];
    }
    const teamMode = game.mode === 'team' || roster.some((r) => r.team);
    return db.addMatch({
      mode: game.mode, multiplayer: false, map: input.map, difficulty: game.difficulty, durationS: game.durationS,
      teamMode, winner: soloWinner(game, roster, teamMode, input.draw), roster, log: input.log, owner: userId,
    });
  }

  /**
   * One page of the player's history. Unknown filters become 'all' and the
   * page size is clamped to 1..50.
   */
  async function history(userId, { filter, before, limit }) {
    return db.history(userId, {
      filter: Object.hasOwn(HISTORY_FILTERS, filter) ? filter : 'all',
      before: typeof before === 'string' ? before : null,
      limit: Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 20)),
    });
  }

  /**
   * Loads one replay. Admins may see any match; players only their own.
   * @throws 404 if it does not exist or the user is not allowed to see it
   */
  async function get(user, matchId) {
    const match = await db.matchForUser(matchId, user.id, user.role === 'admin');
    if (!match) throw notFound('No such match');
    return { match };
  }

  return { saveSolo, history, get };
}

module.exports = { createMatchService, parseMatchInput, soloWinner };
