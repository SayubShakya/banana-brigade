// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

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
auditLogSchema.index({ at: -1 });

module.exports = { auditLogSchema };
