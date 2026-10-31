// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { Schema } = require('mongoose');
const { MODES } = require('./score');

const LOG_TYPES = ['kill', 'puzzle', 'crate', 'power', 'drop', 'respawn', 'wave', 'join', 'leave', 'end'];
const LIMITS = { log: 300, roster: 12, text: 40, count: 999, seconds: 3600 };

const rosterSchema = new Schema({
  name: { type: String, required: true }, team: { type: String, enum: ['blue', 'red'] },
  kills: { type: Number, default: 0 }, deaths: { type: Number, default: 0 }, bot: { type: Boolean, default: false },
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const logSchema = new Schema({
  t: { type: Number, required: true }, type: { type: String, enum: LOG_TYPES, required: true },
  by: String, target: String, weapon: String, ok: Boolean, detail: String,
}, { _id: false });

const matchSchema = new Schema({
  matchId: { type: String, required: true, unique: true },
  mode: { type: String, enum: MODES, required: true },
  multiplayer: { type: Boolean, default: false },
  map: { type: String, default: '' },
  difficulty: { type: String, default: 'medium' },
  durationS: { type: Number, default: 0 },
  teamMode: { type: Boolean, default: false },
  winner: { type: String, default: null },
  roster: { type: [rosterSchema], default: [] },
  log: { type: [logSchema], default: [] },
  owner: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });
matchSchema.index({ owner: 1 });
matchSchema.index({ 'roster.userId': 1 });

const text = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.text) : undefined);
const count = (v) => (Number.isFinite(v) ? Math.min(LIMITS.count, Math.max(0, Math.round(v))) : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function cleanRoster(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(isObj).map((r) => ({
    name: text(r.name), ...(['blue', 'red'].includes(r.team) ? { team: r.team } : {}),
    kills: count(r.kills), deaths: count(r.deaths), bot: r.bot === true,
    ...(r.me === true ? { me: true } : {}), ...(r.userId ? { userId: r.userId } : {}),
  })).filter((r) => r.name).slice(0, LIMITS.roster);
}

function cleanLog(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list) {
    if (out.length >= LIMITS.log) break;
    if (!isObj(e) || !LOG_TYPES.includes(e.type) || !Number.isFinite(e.t)) continue;
    const entry = { t: Math.round(Math.min(LIMITS.seconds, Math.max(0, e.t)) * 10) / 10, type: e.type };
    for (const k of ['by', 'target', 'weapon', 'detail']) if (text(e[k])) entry[k] = text(e[k]);
    if (typeof e.ok === 'boolean') entry.ok = e.ok;
    out.push(entry);
  }
  return out;
}

module.exports = { matchSchema, cleanRoster, cleanLog, text, LOG_TYPES, LIMITS };
