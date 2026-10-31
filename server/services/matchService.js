// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { badRequest, notFound } = require('../lib/errors');
const { cleanRoster, cleanLog, text } = require('../models/match');
const { HISTORY_FILTERS } = require('../repositories/scoreRepository');

const oneMe = (rows) => rows.map((r, i) => (r.me && rows.findIndex((x) => x.me) !== i ? (({ me, ...rest }) => rest)(r) : r));

function parseMatchInput(b) {
  for (const k of ['roster', 'log']) if (b[k] !== undefined && b[k] !== null && !Array.isArray(b[k])) throw badRequest(`${k} must be a list`);
  if (b.map !== undefined && b.map !== null && typeof b.map !== 'string') throw badRequest('map must be text');
  if (b.draw !== undefined && typeof b.draw !== 'boolean') throw badRequest('draw must be true or false');
  return {
    wanted: Array.isArray(b.roster) || Array.isArray(b.log),
    map: text(b.map) ?? '', draw: b.draw === true, roster: oneMe(cleanRoster(b.roster).map(({ userId, ...r }) => r)), log: cleanLog(b.log),
  };
}

function createMatchService({ db }) {
  async function saveSolo(userId, game, input) {
    if (!input.wanted) return null;
    let { roster } = input;
    if (!roster.length) {
      const user = await db.findUserById(userId);
      roster = [{ name: user?.username ?? 'You', kills: game.kills, deaths: game.deaths, bot: false, me: true }];
    }
    const me = roster.find((r) => r.me);
    const teamMode = game.mode === 'team' || roster.some((r) => r.team);
    const others = roster.filter((r) => r !== me).sort((a, b) => b.kills - a.kills);
    let winner = null;
    if (teamMode && me?.team && !input.draw) winner = game.won ? me.team : (me.team === 'blue' ? 'red' : 'blue');
    else if (!teamMode && !input.draw) winner = game.won ? (me?.name ?? null) : (others[0]?.name ?? null);
    return db.addMatch({
      mode: game.mode, multiplayer: false, map: input.map, difficulty: game.difficulty, durationS: game.durationS,
      teamMode, winner, roster, log: input.log, owner: userId,
    });
  }

  async function history(userId, { filter, before, limit }) {
    return db.history(userId, {
      filter: Object.hasOwn(HISTORY_FILTERS, filter) ? filter : 'all',
      before: typeof before === 'string' ? before : null,
      limit: Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 20)),
    });
  }

  async function get(user, matchId) {
    const match = await db.matchForUser(matchId, user.id, user.role === 'admin');
    if (!match) throw notFound('No such match');
    return { match };
  }

  return { saveSolo, history, get };
}

module.exports = { createMatchService, parseMatchInput };
