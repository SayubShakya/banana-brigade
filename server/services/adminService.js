// Service layer: admin tools (list users, reset scores, change role, suspend, restore).
// Every action needs a reason and is written to the audit log.

const { badRequest, notFound, conflict } = require('../lib/errors');

const ROLES = ['player', 'admin'];
const NEED_REASON = 'Give a reason (3–200 characters); it goes in the audit log';

/**
 * Checks the admin gave a reason of 3 to 200 characters.
 * @throws 400 otherwise
 */
function requireReason(raw) {
  const r = typeof raw === 'string' ? raw.trim() : '';
  if (r.length < 3 || r.length > 200) throw badRequest(NEED_REASON);
  return r;
}

/**
 * Creates the admin service. The route already checked the caller is an admin.
 * @param {object} deps db, pool (puzzle pool health), sessions, eventLog
 */
function createAdminService({ db, pool, sessions, eventLog = null }) {
  // Writes the audit log entry and a line in the live activity feed.
  async function audit(admin, action, target, reason, detail, said) {
    await db.addAudit({ actor: admin.id, actorName: admin.username, action, target: target?.id, targetName: target?.username, reason, detail });
    eventLog?.record('admin', admin.username, `${said}. Reason: ${reason}`);
  }

  async function findUser(id) {
    const user = await db.findUserById(id);
    if (!user) throw notFound('No such user');
    return user;
  }

  const listUsers = async () => ({ users: await db.listUsers() });

  /** Recent audit log rows; limit clamped to 1..200. */
  async function listAudit(askedLimit) {
    const limit = Math.min(200, Math.max(1, Number.parseInt(askedLimit, 10) || 50));
    return { rows: await db.listAudit(limit) };
  }

  // Banana API health: current pool status plus recent history.
  const health = () => ({ now: pool.status(), history: pool.history() });

  /** Deletes all of a user's scores and logs it. */
  async function resetScores(admin, id, rawReason) {
    const reason = requireReason(rawReason);
    const user = await findUser(id);
    const deleted = await db.deleteScoresForUser(user.id);
    await audit(admin, 'reset-scores', user, reason, `reset ${deleted} score${deleted === 1 ? '' : 's'}`, `reset ${user.username}'s scores (${deleted})`);
    return { deleted };
  }

  /**
   * Makes a user a player or an admin.
   * @throws 400 for an unknown role, a missing reason, or an admin demoting themself
   */
  async function setRole(admin, id, role, rawReason) {
    if (!ROLES.includes(role)) throw badRequest('Role must be player or admin');
    const reason = requireReason(rawReason);
    // Safety: an admin cannot remove their own admin role (the site could be left with no admin).
    if (id === admin.id && role !== 'admin') throw badRequest('You cannot demote yourself');
    const user = await findUser(id);
    if (user.role !== role) {
      await db.setRole(user.id, role);
      await audit(admin, 'set-role', user, reason, `made ${role}`, `made ${user.username} ${role === 'admin' ? 'an admin' : 'a player'}`);
    }
    return { user: { id: user.id, username: user.username, role } };
  }

  /**
   * Suspends a player and ends all their sessions at once.
   * @throws 400 for self-suspension or suspending an admin; 409 if already suspended
   */
  async function suspend(admin, id, rawReason) {
    const reason = requireReason(rawReason);
    if (id === admin.id) throw badRequest('You cannot suspend yourself');
    const user = await findUser(id);
    if (user.role === 'admin') throw badRequest('Demote an admin before suspending them');
    if (user.suspended) throw conflict('Already suspended');
    await db.suspendUser(user.id, reason, admin.username);
    // Log them out everywhere straight away, including live sockets.
    const ended = await sessions.endAll(user.id);
    const ends = `${ended} session${ended === 1 ? '' : 's'} ended`;
    await audit(admin, 'suspend', user, reason, `suspended (${ends})`, `suspended ${user.username} (${ends})`);
    return { ok: true, ended };
  }

  /** Lifts a suspension. @throws 409 if the user is not suspended */
  async function restore(admin, id, rawReason) {
    const reason = requireReason(rawReason);
    const user = await findUser(id);
    if (!user.suspended) throw conflict('Not suspended');
    await db.restoreUser(user.id);
    await audit(admin, 'restore', user, reason, 'restored', `restored ${user.username}`);
    return { ok: true };
  }

  return { listUsers, listAudit, health, resetScores, setRole, suspend, restore };
}

module.exports = { createAdminService };
