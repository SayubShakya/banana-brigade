// Repository layer: saves and reads the admin audit log in MongoDB.

const { oid } = require('./rows');

/**
 * Creates the audit log repository.
 * @param {object} m the Mongoose models from registerModels()
 * @returns {{addAudit: Function, listAudit: Function}}
 */
function createAuditRepository(m) {
  return {
    /** Saves one admin action (who, what, to whom, why). */
    async addAudit({ actor, actorName, action, target, targetName, reason, detail }) {
      await m.AuditLog.create({ actor: oid(actor), actorName, action, target: target ? oid(target) : undefined, targetName, reason, detail });
    },
    /** Returns the most recent admin actions, newest first, as plain objects for the admin page. */
    async listAudit(limit = 50) {
      const rows = await m.AuditLog.find().sort({ at: -1, _id: -1 }).limit(limit).lean();
      return rows.map((r) => ({ id: String(r._id), at: r.at, actor: r.actorName, action: r.action, target: r.targetName ?? null, reason: r.reason, detail: r.detail ?? null }));
    },
  };
}

module.exports = { createAuditRepository };
