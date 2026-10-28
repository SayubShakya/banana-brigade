// SQLite storage for players, their match results and failed login attempts.
// Every query uses prepared statements with ? or @name parameters, never string
// concatenation, so user input cannot change the SQL (SQL injection).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scores (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode              TEXT NOT NULL CHECK (mode IN ('quick', 'survival', 'training', 'team')),
  kills             INTEGER NOT NULL DEFAULT 0,
  deaths            INTEGER NOT NULL DEFAULT 0,
  wave              INTEGER NOT NULL DEFAULT 0,
  won               INTEGER NOT NULL DEFAULT 0,
  puzzles_solved    INTEGER NOT NULL DEFAULT 0,
  puzzles_attempted INTEGER NOT NULL DEFAULT 0,
  duration_s        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS scores_by_mode ON scores(mode, kills DESC);
CREATE INDEX IF NOT EXISTS scores_by_user ON scores(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  username   TEXT NOT NULL COLLATE NOCASE,
  failed_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_by_user ON login_attempts(username, failed_at);
`;

function openDatabase(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  const q = {
    insertUser: db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?'),
    setRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
    listUsers: db.prepare(`
      SELECT u.id, u.username, u.role, u.created_at,
             COUNT(s.id) AS games, COALESCE(SUM(s.kills), 0) AS kills,
             COALESCE(SUM(s.puzzles_solved), 0) AS puzzles_solved
      FROM users u LEFT JOIN scores s ON s.user_id = u.id
      GROUP BY u.id ORDER BY u.created_at`),

    insertScore: db.prepare(`
      INSERT INTO scores (user_id, mode, kills, deaths, wave, won, puzzles_solved, puzzles_attempted, duration_s)
      VALUES (@userId, @mode, @kills, @deaths, @wave, @won, @puzzlesSolved, @puzzlesAttempted, @durationS)`),
    leaderboard: db.prepare(`
      SELECT s.id, u.username, s.mode, s.kills, s.deaths, s.wave, s.won, s.puzzles_solved, s.puzzles_attempted,
             s.duration_s, s.created_at
      FROM scores s JOIN users u ON u.id = s.user_id
      WHERE s.mode = ?
      ORDER BY CASE WHEN s.mode = 'survival' THEN s.wave ELSE s.kills END DESC, s.puzzles_solved DESC, s.created_at ASC
      LIMIT ?`),
    scoresForUser: db.prepare('SELECT * FROM scores WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'),
    totalsForUser: db.prepare(`
      SELECT COUNT(*) AS games, COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(deaths), 0) AS deaths,
             COALESCE(MAX(wave), 0) AS best_wave, COALESCE(MAX(kills), 0) AS best_kills,
             COALESCE(SUM(puzzles_solved), 0) AS puzzles_solved, COALESCE(SUM(puzzles_attempted), 0) AS puzzles_attempted
      FROM scores WHERE user_id = ?`),
    deleteScoresForUser: db.prepare('DELETE FROM scores WHERE user_id = ?'),

    addAttempt: db.prepare('INSERT INTO login_attempts (username, failed_at) VALUES (?, ?)'),
    countAttempts: db.prepare('SELECT COUNT(*) AS n, MAX(failed_at) AS last FROM login_attempts WHERE username = ? AND failed_at > ?'),
    clearAttempts: db.prepare('DELETE FROM login_attempts WHERE username = ?'),
  };

  return {
    raw: db,
    close: () => db.close(),

    createUser(username, passwordHash, role = 'player') {
      const info = q.insertUser.run(username, passwordHash, role);
      return q.userById.get(info.lastInsertRowid);
    },
    findUserByName: (username) => q.userByName.get(username),
    findUserById: (id) => q.userById.get(id),
    setRole: (id, role) => q.setRole.run(role, id),
    setPassword: (id, hash) => q.setPassword.run(hash, id),
    listUsers: () => q.listUsers.all(),

    addScore: (score) => q.insertScore.run(score).lastInsertRowid,
    leaderboard: (mode, limit = 20) => q.leaderboard.all(mode, limit),
    scoresForUser: (userId, limit = 20) => q.scoresForUser.all(userId, limit),
    totalsForUser: (userId) => q.totalsForUser.get(userId),
    deleteScoresForUser: (userId) => q.deleteScoresForUser.run(userId).changes,

    recordFailedLogin: (username, now = Date.now()) => q.addAttempt.run(username, now),
    recentFailedLogins: (username, sinceMs) => q.countAttempts.get(username, sinceMs),
    clearFailedLogins: (username) => q.clearAttempts.run(username),
  };
}

module.exports = { openDatabase };
