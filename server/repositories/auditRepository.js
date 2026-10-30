// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { oid } = require('./rows');

function createAuditRepository(m) {
  return {
    async addAudit({ actor, actorName, action, target, targetName, reason, detail }) {
      await m.AuditLog.create({ actor: oid(actor), actorName, action, target: target ? oid(target) : undefined, targetName, reason, detail });
    },
    async listAudit(limit = 50) {
      const rows = await m.AuditLog.find().sort({ at: -1, _id: -1 }).limit(limit).lean();
      return rows.map((r) => ({ id: String(r._id), at: r.at, actor: r.actorName, action: r.action, target: r.targetName ?? null, reason: r.reason, detail: r.detail ?? null }));
    },
  };
}

module.exports = { createAuditRepository };
