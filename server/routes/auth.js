// Register, log in, log out and "who am I", plus the account tools: remember me,
// log out of all devices, change password, delete account, a username check and
// "forgot password" (a single-use reset link that lasts 30 minutes).
// This is the virtual identity of the game: passwords are stored only as bcrypt
// hashes, and a logged-in player is recognised by a session cookie that JavaScript
// in the page cannot read (HttpOnly).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { requireLogin } = require('../middleware/auth');
const { endSessionsFor, countSessionsFor, disconnectSocketsFor } = require('../sessions');

const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;           // bcrypt only uses the first 72 bytes
const LOCKOUT_ATTEMPTS = 5;        // wrong passwords for one name from one IP
const IP_ATTEMPTS = 20;            // wrong passwords from one IP, whatever the name
const LOCKOUT_MS = 10 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;   // a reset link works for 30 minutes
const RESETS_PER_IP = 5;           // reset requests from one IP per 15 minutes
const RESET_WINDOW_MS = 15 * 60 * 1000;
const BCRYPT_COST = 10;
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;   // "remember me": 30 days instead of 2 hours
const AVAILABLE_PER_MINUTE = 20;

const publicUser = (u) => ({ id: u.id, username: u.username, role: u.role });

// A real hash to compare against when the username does not exist (see /login).
let dummyHash = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', BCRYPT_COST));

// Reset tokens: 32 random bytes sent in the link, and only their SHA-256 hash kept.
// A fast hash is enough here (unlike passwords): the token is random and long, so it
// cannot be guessed from its hash.
const newResetToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// In development the "email" is a line in the server terminal, so the demo needs no
// mail service. A real deployment would pass a function that sends an email.
function logResetLink({ username, link, expiresAt }) {
  console.log(`[password reset] Link for ${username}, valid until ${new Date(expiresAt).toLocaleTimeString()}:\n  ${link}`);
}

const waitMinutes = (resetAt, now) => Math.max(1, Math.ceil((resetAt - now) / 60000));

// Starts a fresh session for the user. Regenerating the session id at login means an
// id an attacker planted before login is useless afterwards (session fixation).
// remember: keep the cookie for 30 days. Off by default, because a long-lived cookie
// on a shared computer lets the next person in.
function startSession(req, user, { remember = false } = {}) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      req.session.puzzles = { solved: 0, attempted: 0 };
      req.session.createdAt = new Date().toISOString();
      // Set after regenerate (which makes a fresh cookie); connect-mongo stores the
      // session with this cookie's expiry, so the server copy lives 30 days too.
      if (remember) req.session.cookie.maxAge = REMEMBER_MS;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

// Destroys this request's session and tells the browser to forget the cookie.
function endThisSession(req, res) {
  const cookieName = req.app.get('sessionCookieName');
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) return reject(err);
      res.clearCookie(cookieName, { path: '/' });
      resolve();
    });
  });
}

// appUrl: the address put in reset links. In production it must come from settings
// (APP_URL), never from the request's Host header, which an attacker can change to
// make the server hand out links to their own site.
function createAuthRouter({ db, now = () => Date.now(), sendResetLink = logResetLink, appUrl = null }) {
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
      const { username, password, remember } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: 'Enter your username and password' });
      }
      // Two limits, counted per IP address:
      //  - 5 tries for one name from one IP. A stranger typing wrong passwords for your
      //    name only locks themselves out, not you on your own network.
      //  - 20 tries from one IP across all names, so one machine cannot guess
      //    passwords for many accounts.
      // Every try is counted *before* the password is checked, with an atomic $inc, so
      // a burst of parallel guesses cannot all slip in under the limit. A correct
      // password takes its try back off again.
      const name = username.toLowerCase();
      const pairKey = `login:${name}|${req.ip}`;
      const ipKey = `login-ip:${req.ip}`;
      const t = now();
      const opts = { windowMs: LOCKOUT_MS, now: t, ip: req.ip };
      const [pair, fromIp] = await Promise.all([
        db.bumpCounter(pairKey, { ...opts, username: name }),
        db.bumpCounter(ipKey, opts),
      ]);
      if (pair.n > LOCKOUT_ATTEMPTS || fromIp.n > IP_ATTEMPTS) {
        const resetAt = pair.n > LOCKOUT_ATTEMPTS ? pair.resetAt : fromIp.resetAt;
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${waitMinutes(resetAt, t)} min.` });
      }
      const user = await db.findUserByName(username);
      // Compare even when the user does not exist, so the response time does not
      // reveal which usernames are registered.
      const ok = await bcrypt.compare(password, user ? user.password_hash : getDummyHash());
      if (!user || !ok) {
        const left = LOCKOUT_ATTEMPTS - pair.n;
        return res.status(401).json({ error: left > 0 ? `Wrong username or password (${left} tries left)` : 'Wrong username or password. Locked for 10 min on this network.' });
      }
      await Promise.all([db.clearCounter(pairKey), db.undoCounter(ipKey)]);
      await db.touchLogin(user.id);
      await startSession(req, user, { remember: remember === true });
      res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res, next) => {
    endThisSession(req, res).then(() => res.json({ ok: true }), next);
  });

  // Ends the session on every device (phone, lab PC, ...). Useful if the player
  // forgot to log out somewhere or thinks someone else has their cookie.
  router.post('/logout-all', requireLogin, async (req, res, next) => {
    try {
      const userId = req.session.userId;
      const ended = await endSessionsFor(req.sessionStore, userId);
      disconnectSocketsFor(req.app.locals.io, userId);
      await endThisSession(req, res);
      res.json({ ok: true, ended });
    } catch (err) {
      next(err);
    }
  });

  // Asks for the current password again, so someone using a session left open on a
  // shared computer cannot lock the real owner out.
  router.post('/password', requireLogin, async (req, res, next) => {
    try {
      const { current, next: fresh } = req.body ?? {};
      if (typeof fresh !== 'string' || fresh.length < MIN_PASSWORD || fresh.length > MAX_PASSWORD) {
        return res.status(400).json({ error: `New password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters` });
      }
      const user = await db.findUserById(req.session.userId);
      if (!user || typeof current !== 'string' || !(await bcrypt.compare(current, user.password_hash))) {
        return res.status(403).json({ error: 'Your current password is not right' });
      }
      await db.setPassword(user.id, await bcrypt.hash(fresh, BCRYPT_COST));
      // A changed password should also throw out anyone who got in with the old one.
      const ended = await endSessionsFor(req.sessionStore, user.id, { keepSid: req.sessionID });
      disconnectSocketsFor(req.app.locals.io, user.id, { keepSid: req.sessionID });
      res.json({ ok: true, ended });
    } catch (err) {
      next(err);
    }
  });

  // Deletes the account and everything stored about the player: the user document
  // (with campaign progress and achievements), scores, daily results, failed-login
  // records, sessions and open sockets. GDPR gives people the right to have their personal data
  // erased ("right to be forgotten"), so this is a real delete, not a hidden flag.
  router.delete('/account', requireLogin, async (req, res, next) => {
    try {
      const { password } = req.body ?? {};
      const user = await db.findUserById(req.session.userId);
      if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(403).json({ error: 'Type your password to confirm' });
      }
      await db.deleteUser(user.id);
      await db.clearFailedLogins(user.username);
      await endSessionsFor(req.sessionStore, user.id);
      disconnectSocketsFor(req.app.locals.io, user.id);
      await endThisSession(req, res);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Forgot password, step 1: ask for a reset link by username (accounts have no email
  // address). The reply is the same whether or not the name exists, so this cannot
  // be used to find out who has an account. Limited to 5 requests per IP every 15 min.
  router.post('/forgot', async (req, res, next) => {
    try {
      const { username } = req.body ?? {};
      if (typeof username !== 'string' || !USERNAME.test(username)) {
        return res.status(400).json({ error: 'Enter your username' });
      }
      const t = now();
      const limit = await db.bumpCounter(`reset-ip:${req.ip}`, { windowMs: RESET_WINDOW_MS, now: t, ip: req.ip });
      if (limit.n > RESETS_PER_IP) {
        return res.status(429).json({ error: `Too many reset requests. Try again in ${waitMinutes(limit.resetAt, t)} min.` });
      }
      const user = await db.findUserByName(username);
      if (user) {
        const token = newResetToken();
        const expiresAt = t + RESET_MS;
        await db.createPasswordReset(user.id, hashToken(token), new Date(expiresAt));
        const base = appUrl ?? `${req.protocol}://${req.get('host')}`;
        await sendResetLink({ username: user.username, link: `${base}/#reset=${token}`, expiresAt });
      }
      res.json({ ok: true, message: 'If that account exists, a reset link has been sent. It works once, for 30 minutes.' });
    } catch (err) {
      next(err);
    }
  });

  // Forgot password, step 2: the link's token plus a new password. The token is
  // marked used in the same step that checks it, so it works only once. Every
  // session of the account is ended (whoever had the old password is thrown out),
  // and the login lockout for the name is cleared.
  router.post('/reset', async (req, res, next) => {
    try {
      const { token, password } = req.body ?? {};
      if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        return res.status(400).json({ error: `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters` });
      }
      const userId = typeof token === 'string' && token.length <= 100 ? await db.usePasswordReset(hashToken(token), now()) : null;
      const user = userId && await db.findUserById(userId);
      if (!user) return res.status(400).json({ error: 'This reset link is not valid any more. Ask for a new one.' });
      await db.setPassword(user.id, await bcrypt.hash(password, BCRYPT_COST));
      const ended = await endSessionsFor(req.sessionStore, user.id);
      disconnectSocketsFor(req.app.locals.io, user.id);
      await db.clearFailedLogins(user.username);
      res.json({ ok: true, username: user.username, ended });
    } catch (err) {
      next(err);
    }
  });

  // Live "is this name free?" hint for the sign-up form. Trade-off: it tells anyone
  // whether a username exists (user enumeration), while /login works hard not to
  // (same message for both mistakes, and a dummy bcrypt compare so the timing is
  // the same). Sign-up has to reveal a taken name anyway (409), and usernames are
  // public on the leaderboard, so the extra cost is mainly speed. A limit of 20
  // checks a minute, per session (or per IP before login, since visitors have no
  // session yet), keeps it from being used to list accounts quickly.
  const lookups = new Map();   // session id or ip -> { start, n }
  router.get('/available', (req, res, next) => {
    const t = now();
    const key = req.session.userId ? `s:${req.sessionID}` : `ip:${req.ip}`;
    const entry = lookups.get(key);
    if (!entry || t - entry.start > 60_000) lookups.set(key, { start: t, n: 1 });
    else if (++entry.n > AVAILABLE_PER_MINUTE) return res.status(429).json({ error: 'Too many checks. Wait a minute.' });
    if (lookups.size > 10_000) lookups.clear();   // never grows without limit
    const name = String(req.query.u ?? '');
    if (!USERNAME.test(name)) return res.json({ available: false, valid: false });
    db.findUserByName(name).then((u) => res.json({ available: !u, valid: true }), next);
  });

  // How many devices are logged in to this account, plus account dates for the profile.
  router.get('/sessions', requireLogin, async (req, res, next) => {
    try {
      const user = await db.findUserById(req.session.userId);
      if (!user) return res.status(404).json({ error: 'No such user' });
      res.json({
        count: await countSessionsFor(req.sessionStore, user.id),
        current: { createdAt: req.session.createdAt ?? null, expires: req.session.cookie.expires ?? null },
        memberSince: user.created_at, lastLogin: user.last_login_at,
      });
    } catch (err) {
      next(err);
    }
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
