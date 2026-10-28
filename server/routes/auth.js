// Register, log in, log out and "who am I". This is the virtual identity of the game:
// passwords are stored only as bcrypt hashes, and a logged-in player is recognised
// by a session cookie that JavaScript in the page cannot read (HttpOnly).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const express = require('express');
const bcrypt = require('bcryptjs');

const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;           // bcrypt only uses the first 72 bytes
const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000;
const BCRYPT_COST = 10;

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role });

// A real hash to compare against when the username does not exist (see /login).
let dummyHash = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', BCRYPT_COST));

// Starts a fresh session for the user. Regenerating the session id at login means an
// id an attacker planted before login is useless afterwards (session fixation).
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.puzzles = { solved: 0, attempted: 0 };
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

function createAuthRouter({ db, now = () => Date.now() }) {
  const router = express.Router();

  router.post('/register', async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || !USERNAME.test(username)) {
        return res.status(400).json({ error: 'Username must be 3–16 letters, numbers or _' });
      }
      if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        return res.status(400).json({ error: `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters` });
      }
      if (await db.findUserByName(username)) return res.status(409).json({ error: 'That username is taken' });
      const hash = await bcrypt.hash(password, BCRYPT_COST);
      let user;
      try {
        user = await db.createUser(username, hash);
      } catch (err) {
        // Two sign-ups with the same name at the same moment: the unique index wins.
        if (err.code === 11000) return res.status(409).json({ error: 'That username is taken' });
        throw err;
      }
      await startSession(req, user);
      res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: 'Enter your username and password' });
      }
      const since = now() - LOCKOUT_MS;
      const recent = await db.recentFailedLogins(username, since);
      if (recent.n >= LOCKOUT_ATTEMPTS) {
        const wait = Math.ceil((recent.last + LOCKOUT_MS - now()) / 60000);
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${wait} min.` });
      }
      const user = await db.findUserByName(username);
      // Compare even when the user does not exist, so the response time does not
      // reveal which usernames are registered.
      const ok = await bcrypt.compare(password, user ? user.password_hash : getDummyHash());
      if (!user || !ok) {
        await db.recordFailedLogin(username, now());
        const left = LOCKOUT_ATTEMPTS - recent.n - 1;
        return res.status(401).json({ error: left > 0 ? `Wrong username or password (${left} tries left)` : 'Wrong username or password. Account locked for 10 min.' });
      }
      await db.clearFailedLogins(username);
      await db.touchLogin(user.id);
      await startSession(req, user);
      res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res, next) => {
    const cookieName = req.app.get('sessionCookieName');
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie(cookieName, { path: '/' });
      res.json({ ok: true });
    });
  });

  router.get('/me', async (req, res, next) => {
    try {
      if (!req.session.userId) return res.json({ user: null });
      const user = await db.findUserById(req.session.userId);
      if (!user) return res.json({ user: null });
      res.json({ user: publicUser(user), puzzles: req.session.puzzles ?? { solved: 0, attempted: 0 } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAuthRouter, USERNAME, MIN_PASSWORD };
