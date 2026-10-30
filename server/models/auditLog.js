// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');

// The audit log: one row for every admin action (who, what, to whom, when and why).
// Kept when the target account is deleted (names are stored as text), so the
// record of what admins did stays complete.
const auditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  action: { type: String, enum: ['reset-scores', 'set-role', 'suspend', 'restore'], required: true },
  target: { type: Schema.Types.ObjectId, ref: 'User' },
  targetName: String,
  reason: { type: String, required: true },
  detail: String,
}, { timestamps: { createdAt: 'at', updatedAt: false } });
auditLogSchema.index({ at: -1 });

module.exports = { auditLogSchema };
