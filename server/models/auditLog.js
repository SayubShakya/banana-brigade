// Model layer: Mongoose schema for the admin audit log.
// Every admin action (reset scores, change role, suspend, restore) is saved here
// with who did it, to whom and why, so admin power is accountable.

const { Schema } = require('mongoose');

const auditLogSchema = new Schema({
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorName: { type: String, required: true },
  action: { type: String, enum: ['reset-scores', 'set-role', 'suspend', 'restore'], required: true },
  target: { type: Schema.Types.ObjectId, ref: 'User' },
  targetName: String,
  reason: { type: String, required: true },
  detail: String,
}, { timestamps: { createdAt: 'at', updatedAt: false } });
// Index on time (newest first) so the admin page can list recent actions quickly.
auditLogSchema.index({ at: -1 });

module.exports = { auditLogSchema };
