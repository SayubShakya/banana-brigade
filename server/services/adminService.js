// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { badRequest, notFound, conflict } = require('../lib/errors');

const ROLES = ['player', 'admin'];
const NEED_REASON = 'Give a reason (3–200 characters); it goes in the audit log';

function requireReason(raw) {
  const r = typeof raw === 'string' ? raw.trim() : '';
  if (r.length < 3 || r.length > 200) throw badRequest(NEED_REASON);
  return r;
}

function createAdminService({ db, pool, sessions, eventLog = null }) {
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

  async function listAudit(askedLimit) {
    const limit = Math.min(200, Math.max(1, Number.parseInt(askedLimit, 10) || 50));
    return { rows: await db.listAudit(limit) };
  }

  const health = () => ({ now: pool.status(), history: pool.history() });

  async function resetScores(admin, id, rawReason) {
    const reason = requireReason(rawReason);
    const user = await findUser(id);
    const deleted = await db.deleteScoresForUser(user.id);
    await audit(admin, 'reset-scores', user, reason, `reset ${deleted} score${deleted === 1 ? '' : 's'}`, `reset ${user.username}'s scores (${deleted})`);
    return { deleted };
  }

  async function setRole(admin, id, role, rawReason) {
    if (!ROLES.includes(role)) throw badRequest('Role must be player or admin');
    const reason = requireReason(rawReason);
    if (id === admin.id && role !== 'admin') throw badRequest('You cannot demote yourself');
    const user = await findUser(id);
    if (user.role !== role) {
      await db.setRole(user.id, role);
      await audit(admin, 'set-role', user, reason, `made ${role}`, `made ${user.username} ${role === 'admin' ? 'an admin' : 'a player'}`);
    }
    return { user: { id: user.id, username: user.username, role } };
  }

  async function suspend(admin, id, rawReason) {
    const reason = requireReason(rawReason);
    if (id === admin.id) throw badRequest('You cannot suspend yourself');
    const user = await findUser(id);
    if (user.role === 'admin') throw badRequest('Demote an admin before suspending them');
    if (user.suspended) throw conflict('Already suspended');
    await db.suspendUser(user.id, reason, admin.username);
    const ended = await sessions.endAll(user.id);
    const ends = `${ended} session${ended === 1 ? '' : 's'} ended`;
    await audit(admin, 'suspend', user, reason, `suspended (${ends})`, `suspended ${user.username} (${ends})`);
    return { ok: true, ended };
  }

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
