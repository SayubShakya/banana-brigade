// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const mongoose = require('mongoose');

const userRow = (u) => u && ({
  id: String(u._id), username: u.username, role: u.role, password_hash: u.passwordHash,
  created_at: u.createdAt, last_login_at: u.lastLoginAt ?? null,
  guest: !!u.guest, suspended: u.suspended?.at ? u.suspended : null,
  achievements: u.achievements ?? [], daily: u.daily ?? { lastDate: '', streak: 0, best: 0 },
});

const scoreRow = (s) => ({
  id: String(s._id), username: s.username, mode: s.mode, difficulty: s.difficulty ?? 'medium', kills: s.kills, deaths: s.deaths, wave: s.wave,
  won: s.won ? 1 : 0, puzzles_solved: s.puzzlesSolved, puzzles_attempted: s.puzzlesAttempted,
  duration_s: s.durationS, created_at: s.createdAt, multiplayer: !!s.multiplayer,
});

const isId = (id) => mongoose.isValidObjectId(id);
const oid = (id) => new mongoose.Types.ObjectId(String(id));

module.exports = { userRow, scoreRow, isId, oid };
