// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { badRequest, unauthorized, forbidden, conflict, tooMany, AppError } = require('../lib/errors');
const { noPwnedCheck } = require('./pwned');

const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;
const RESET_MS = 30 * 60 * 1000;
const GUEST_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_COST = 10;
const AVAILABLE_PER_MINUTE = 20;

const BAD_NAME = 'Username must be 3–16 letters, numbers or _';
const GUEST_NAME = 'Names starting with guest_ are kept for guests';
const BAD_PASSWORD = `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`;
const NAME_TAKEN = 'That username is taken';
const BAD_RESET_LINK = 'This reset link is not valid any more. Ask for a new one.';

const validPassword = (p) => typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;

let dummyHash = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', BCRYPT_COST));

const newResetToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function logResetLink({ username, link, expiresAt }) {
  console.log(`[password reset] Link for ${username}, valid until ${new Date(expiresAt).toLocaleTimeString()}:\n  ${link}`);
}

function checkNewAccount(username, password) {
  if (typeof username !== 'string' || !USERNAME.test(username)) throw badRequest(BAD_NAME);
  if (/^guest_/i.test(username)) throw badRequest(GUEST_NAME);
  if (!validPassword(password)) throw badRequest(BAD_PASSWORD);
}

function createAuthService({
  db, limiter, sessions, now = () => Date.now(), sendResetLink = logResetLink,
  appUrl = null, pwnedCheck = noPwnedCheck, eventLog = null,
}) {
  const log = (kind, user, text) => eventLog?.record(kind, user, text);

  async function refuseBreached(password) {
    const { pwned, count } = await pwnedCheck(password);
    if (pwned) throw badRequest(`Hackers already know this password: it is in ${count.toLocaleString('en-GB')} leaked password list${count === 1 ? '' : 's'} (checked safely with Have I Been Pwned). Pick a different one, or press "Suggest a strong password".`, { pwned: true });
  }

  const passwordMatches = async (user, password) => typeof password === 'string' && bcrypt.compare(password, user.password_hash);

  async function register({ username, password }, session) {
    checkNewAccount(username, password);
    if (await db.findUserByName(username)) throw conflict(NAME_TAKEN);
    await refuseBreached(password);
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    let user;
    try {
      user = await db.createUser(username, hash);
    } catch (err) {
      if (err.code === 11000) throw conflict(NAME_TAKEN);
      throw err;
    }
    await session.start(user);
    log('auth', user.username, 'created an account');
    return user;
  }

  async function login({ username, password, remember, ip }, session) {
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      throw badRequest('Enter your username and password');
    }
    const name = username.toLowerCase();
    const attempt = await limiter.login(name, ip);
    if (attempt.blocked) {
      log('security', name, `was blocked after too many tries (from ${ip})`);
      throw tooMany(`Too many failed attempts. Try again in ${attempt.waitMin} min.`);
    }
    const user = await db.findUserByName(username);
    const hash = user && !user.guest ? user.password_hash : getDummyHash();
    const ok = (await bcrypt.compare(password, hash)) && !user?.guest;
    if (!user || !ok) {
      log('security', name, 'typed a wrong password');
      throw unauthorized(attempt.left > 0 ? `Wrong username or password (${attempt.left} tries left)` : 'Wrong username or password. Locked for 10 min on this network.');
    }
    await attempt.succeeded();
    if (user.suspended) {
      log('security', user.username, 'tried to log in while suspended');
      throw forbidden(`This account is suspended: ${user.suspended.reason}`, { suspended: true });
    }
    await db.touchLogin(user.id);
    await session.start(user, { remember: remember === true });
    log('auth', user.username, `logged in${remember === true ? ' (remember me)' : ''}`);
    return user;
  }

  async function logout(username, session) {
    if (username) log('auth', username, 'logged out');
    await session.end();
  }

  async function logoutEverywhere(userId, session) {
    const ended = await sessions.endAll(userId);
    await session.end();
    return ended;
  }

  async function changePassword(userId, { current, next }, session) {
    if (!validPassword(next)) throw badRequest(`New password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`);
    const user = await db.findUserById(userId);
    if (user?.guest) throw forbidden('Save your account first, then you can set a password');
    if (!user || !(await passwordMatches(user, current))) throw forbidden('Your current password is not right');
    await refuseBreached(next);
    await db.setPassword(user.id, await bcrypt.hash(next, BCRYPT_COST));
    return sessions.endAll(user.id, { keepSid: session.id });
  }

  async function deleteAccount(userId, password, session) {
    const user = await db.findUserById(userId);
    if (!user || (!user.guest && !(await passwordMatches(user, password)))) throw forbidden('That password is not right');
    await db.deleteUser(user.id);
    await limiter.clearName(user.username);
    await sessions.endAll(user.id);
    await session.end();
  }

  async function startGuest(ip, session) {
    const t = now();
    const limit = await limiter.hit('guest', ip);
    if (!limit.allowed) throw tooMany(`Too many guest accounts from this network. Try again in ${limit.waitMin} min.`);
    let user = null;
    for (let i = 0; !user && i < 5; i++) {
      const name = `guest_${crypto.randomBytes(4).toString('hex').slice(0, 6)}`;
      try {
        user = await db.createGuest(name, new Date(t + GUEST_MS));
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    if (!user) throw new AppError(503, 'Could not make a guest name. Try again.');
    await session.start(user, { maxAge: GUEST_MS });
    log('auth', user.username, 'started playing as a guest');
    return user;
  }

  async function upgradeGuest(guest, { username, password }, session) {
    if (!guest.guest) throw badRequest('This account is already saved');
    checkNewAccount(username, password);
    const other = await db.findUserByName(username);
    if (other && other.id !== guest.id) throw conflict(NAME_TAKEN);
    await refuseBreached(password);
    let user;
    try {
      user = await db.upgradeGuest(guest.id, username, await bcrypt.hash(password, BCRYPT_COST));
    } catch (err) {
      if (err.code === 11000) throw conflict(NAME_TAKEN);
      throw err;
    }
    if (!user) throw badRequest('This account is already saved');
    await session.start(user);
    log('auth', user.username, `saved guest ${guest.username} as a full account`);
    return user;
  }

  async function requestReset({ username, ip, origin }) {
    if (typeof username !== 'string' || !USERNAME.test(username)) throw badRequest('Enter your username');
    const t = now();
    const limit = await limiter.hit('reset', ip);
    if (!limit.allowed) throw tooMany(`Too many reset requests. Try again in ${limit.waitMin} min.`);
    const user = await db.findUserByName(username);
    if (user && !user.guest) {
      const token = newResetToken();
      const expiresAt = t + RESET_MS;
      await db.createPasswordReset(user.id, hashToken(token), new Date(expiresAt));
      const base = appUrl ?? origin();
      log('security', user.username, 'asked for a password reset link');
      await sendResetLink({ username: user.username, link: `${base}/#reset=${token}`, expiresAt });
    }
  }

  const resetUserId = (token, use) => (typeof token === 'string' && token.length <= 100 ? use(hashToken(token), now()) : null);

  async function checkReset(token) {
    const userId = await resetUserId(token, db.peekPasswordReset);
    const user = userId && await db.findUserById(userId);
    if (!user) throw badRequest(BAD_RESET_LINK);
    return user;
  }

  async function resetPassword({ token, password }) {
    if (!validPassword(password)) throw badRequest(BAD_PASSWORD);
    await refuseBreached(password);
    const userId = await resetUserId(token, db.usePasswordReset);
    const user = userId && await db.findUserById(userId);
    if (!user) throw badRequest(BAD_RESET_LINK);
    await db.setPassword(user.id, await bcrypt.hash(password, BCRYPT_COST));
    const ended = await sessions.endAll(user.id);
    await limiter.clearName(user.username);
    log('security', user.username, `reset their password (${ended} session${ended === 1 ? '' : 's'} ended)`);
    return { user, ended };
  }

  const lookups = new Map();
  async function isAvailable(name, key) {
    const t = now();
    const entry = lookups.get(key);
    if (!entry || t - entry.start > 60_000) lookups.set(key, { start: t, n: 1 });
    else if (++entry.n > AVAILABLE_PER_MINUTE) throw tooMany('Too many checks. Wait a minute.');
    if (lookups.size > 10_000) lookups.clear();
    if (!USERNAME.test(name)) return { available: false, valid: false };
    return { available: !(await db.findUserByName(name)), valid: true };
  }

  async function currentUser(userId) {
    if (!userId) return null;
    const user = await db.findUserById(userId);
    return !user || user.suspended ? null : user;
  }

  return {
    register, login, logout, logoutEverywhere, changePassword, deleteAccount, startGuest,
    upgradeGuest, requestReset, checkReset, resetPassword, isAvailable, currentUser,
  };
}

module.exports = { createAuthService, USERNAME, MIN_PASSWORD, MAX_PASSWORD };
