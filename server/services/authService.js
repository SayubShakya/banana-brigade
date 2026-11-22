// Service layer: everything about identity (virtual identity theme): register, login,
// logout, guests, password change and reset. Passwords are hashed with bcrypt.

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { badRequest, unauthorized, forbidden, conflict, tooMany, AppError } = require('../lib/errors');
const { noPwnedCheck } = require('./pwned');

// Username rule: 3-16 letters, numbers or underscore (also blocks odd characters and injection).
const USERNAME = /^[A-Za-z0-9_]{3,16}$/;
const MIN_PASSWORD = 8;
// bcrypt only uses the first 72 bytes of a password, so longer ones are refused.
const MAX_PASSWORD = 72;
const RESET_MS = 30 * 60 * 1000;
const GUEST_MS = 7 * 24 * 60 * 60 * 1000;
// bcrypt cost 10 = 2^10 rounds: slow enough to make guessing hashes expensive, fast enough for login.
const BCRYPT_COST = 10;
// The "is this username free?" check is limited to 20 per minute per client.
const AVAILABLE_PER_MINUTE = 20;

const BAD_NAME = 'Username must be 3–16 letters, numbers or _';
const GUEST_NAME = 'Names starting with guest_ are kept for guests';
const BAD_PASSWORD = `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`;
const NAME_TAKEN = 'That username is taken';
const BAD_RESET_LINK = 'This reset link is not valid any more. Ask for a new one.';

const validPassword = (p) => typeof p === 'string' && p.length >= MIN_PASSWORD && p.length <= MAX_PASSWORD;

// Timing defence: when a username does not exist we still run bcrypt.compare against this
// fake hash, so the reply takes the same time and attackers cannot tell which usernames exist.
let dummyHash = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('not-a-real-password', BCRYPT_COST));

// Reset tokens are 32 random bytes; only their SHA-256 hash is saved in the database.
const newResetToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Default way to "send" a reset link in development: print it in the server console.
function logResetLink({ username, link, expiresAt }) {
  console.log(`[password reset] Link for ${username}, valid until ${new Date(expiresAt).toLocaleTimeString()}:\n  ${link}`);
}

/**
 * Validates a new username and password.
 * @throws 400 if the username is invalid, starts with guest_, or the password length is wrong
 */
function checkNewAccount(username, password) {
  if (typeof username !== 'string' || !USERNAME.test(username)) throw badRequest(BAD_NAME);
  if (/^guest_/i.test(username)) throw badRequest(GUEST_NAME);
  if (!validPassword(password)) throw badRequest(BAD_PASSWORD);
}

/**
 * Creates the auth service.
 * @param {object} deps db, limiter (rate limiter), sessions (session manager), now (clock),
 *   sendResetLink, appUrl, pwnedCheck (Have I Been Pwned), eventLog
 */
function createAuthService({
  db, limiter, sessions, now = () => Date.now(), sendResetLink = logResetLink,
  appUrl = null, pwnedCheck = noPwnedCheck, eventLog = null,
}) {
  const log = (kind, user, text) => eventLog?.record(kind, user, text);

  /** Refuses a password found in data breaches. @throws 400 with pwned: true */
  async function refuseBreached(password) {
    const { pwned, count } = await pwnedCheck(password);
    if (pwned) throw badRequest(`Hackers already know this password: it is in ${count.toLocaleString('en-GB')} leaked password list${count === 1 ? '' : 's'} (checked safely with Have I Been Pwned). Pick a different one, or press "Suggest a strong password".`, { pwned: true });
  }

  // Compares a typed password with the stored bcrypt hash (bcrypt reads the salt from the hash).
  const passwordMatches = async (user, password) => typeof password === 'string' && bcrypt.compare(password, user.password_hash);

  /**
   * Creates an account and logs the new user in.
   * @param {object} body username and password
   * @param {object} session session port (see lib/httpSession.js)
   * @returns {Promise<object>} the new user
   * @throws 400 invalid input or breached password; 409 username taken
   */
  async function register({ username, password }, session) {
    checkNewAccount(username, password);
    if (await db.findUserByName(username)) throw conflict(NAME_TAKEN);
    await refuseBreached(password);
    // The password is never stored: only the salted bcrypt hash.
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    let user;
    try {
      user = await db.createUser(username, hash);
    } catch (err) {
      // Two sign-ups with the same name at once: the unique index catches the second.
      if (err.code === 11000) throw conflict(NAME_TAKEN);
      throw err;
    }
    await session.start(user);
    log('auth', user.username, 'created an account');
    return user;
  }

  /**
   * Logs a user in.
   * @param {object} body username, password, remember (30-day cookie), ip, requireRole ('admin' for the admin login page)
   * @param {object} session session port
   * @returns {Promise<object>} the user
   * @throws 400 missing fields; 429 locked out; 401 wrong details; 403 suspended or not an admin
   */
  async function login({ username, password, remember, ip, requireRole }, session) {
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      throw badRequest('Enter your username and password');
    }
    const name = username.toLowerCase();
    // Rate limit / lockout is checked before the password, so a locked account cannot be guessed at all.
    const attempt = await limiter.login(name, ip);
    if (attempt.blocked) {
      log('security', name, `was blocked after too many tries (from ${ip})`);
      throw tooMany(`Too many failed attempts. Try again in ${attempt.waitMin} min.`);
    }
    const user = await db.findUserByName(username);
    // Always run bcrypt, using the dummy hash if the user is missing (timing defence, see above).
    const hash = user && !user.guest ? user.password_hash : getDummyHash();
    const ok = (await bcrypt.compare(password, hash)) && !user?.guest;
      // Same message for "no such user" and "wrong password", so usernames are not leaked.
    if (!user || !ok) {
      log('security', name, 'typed a wrong password');
      throw unauthorized(attempt.left > 0 ? `Wrong username or password (${attempt.left} ${attempt.left === 1 ? 'try' : 'tries'} left)` : 'Wrong username or password. Locked for 10 min on this network.');
    }
    // Correct password: reset the failed-attempt counter.
    await attempt.succeeded();
    if (user.suspended) {
      log('security', user.username, 'tried to log in while suspended');
      throw forbidden(`This account is suspended: ${user.suspended.reason}`, { suspended: true });
    }
    // Separate admin login: a correct password is not enough, the role must be admin.
    if (requireRole && user.role !== requireRole) {
      log('security', user.username, 'tried the admin login without admin rights');
      throw forbidden('This login is for admins only. Players log in on the normal page.');
    }
    await db.touchLogin(user.id);
    // Creates a fresh session ID (regenerate) to prevent session fixation.
    await session.start(user, { remember: remember === true });
    log('auth', user.username, `logged in${requireRole ? ' (admin page)' : remember === true ? ' (remember me)' : ''}`);
    return user;
  }

  /** Logs out this browser only. */
  async function logout(username, session) {
    if (username) log('auth', username, 'logged out');
    await session.end();
  }

  /** Logs out every device for this user. @returns number of sessions ended */
  async function logoutEverywhere(userId, session) {
    const ended = await sessions.endAll(userId);
    await session.end();
    return ended;
  }

  /**
   * Changes the password after checking the current one, then logs out all
   * other devices (keeps this session), in case someone else knew the old password.
   * @throws 400 bad new password; 403 wrong current password or guest account
   */
  async function changePassword(userId, { current, next }, session) {
    if (!validPassword(next)) throw badRequest(`New password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`);
    const user = await db.findUserById(userId);
    if (user?.guest) throw forbidden('Save your account first, then you can set a password');
    if (!user || !(await passwordMatches(user, current))) throw forbidden('Your current password is not right');
    await refuseBreached(next);
    await db.setPassword(user.id, await bcrypt.hash(next, BCRYPT_COST));
    return sessions.endAll(user.id, { keepSid: session.id });
  }

  /**
   * Deletes the account and all its data after checking the password (guests need none),
   * then ends every session.
   * @throws 403 wrong password
   */
  async function deleteAccount(userId, password, session) {
    const user = await db.findUserById(userId);
    if (!user || (!user.guest && !(await passwordMatches(user, password)))) throw forbidden('That password is not right');
    await db.deleteUser(user.id);
    await limiter.clearName(user.username);
    await sessions.endAll(user.id);
    await session.end();
  }

  /**
   * Creates a guest account with a random name like guest_1a2b3c that expires in 7 days.
   * @throws 429 too many guests from this IP; 503 if no free name was found
   */
  async function startGuest(ip, session) {
    const t = now();
    const limit = await limiter.hit('guest', ip);
    if (!limit.allowed) throw tooMany(`Too many guest accounts from this network. Try again in ${limit.waitMin} min.`);
    let user = null;
    // Try up to 5 random names in case one is already taken.
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

  /**
   * Turns a guest into a saved account with a real username and password.
   * Old matches are renamed from the guest name to the new name.
   * @throws 400 not a guest or invalid input; 409 username taken
   */
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
    await db.renamePlayerInMatches(user.id, guest.username, user.username);
    await session.start(user);
    log('auth', user.username, `saved guest ${guest.username} as a full account`);
    return user;
  }

  /**
   * Starts a password reset. Always succeeds from the outside, even for unknown
   * names, so this cannot be used to find out which usernames exist.
   * @throws 400 invalid username; 429 too many requests from this IP
   */
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
      // The real token only goes in the link; the database keeps its hash.
      await sendResetLink({ username: user.username, link: `${base}/#reset=${token}`, expiresAt });
    }
  }

  // Hashes the token from the link and looks it up (peek = check only, use = mark as used). Long tokens are rejected.
  const resetUserId = (token, use) => (typeof token === 'string' && token.length <= 100 ? use(hashToken(token), now()) : null);

  /** Checks a reset link is still valid before showing the new password form. @throws 400 */
  async function checkReset(token) {
    const userId = await resetUserId(token, db.peekPasswordReset);
    const user = userId && await db.findUserById(userId);
    if (!user) throw badRequest(BAD_RESET_LINK);
    return user;
  }

  /**
   * Sets a new password from a reset link. The token is single-use. All sessions
   * are ended and the lockout counters cleared.
   * @throws 400 invalid password, breached password or bad link
   */
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

  // In-memory counters for the username availability check (per client key, 1 minute window).
  const lookups = new Map();
  /**
   * Says whether a username is free (used while typing on the sign-up form).
   * @throws 429 after 20 checks a minute
   */
  async function isAvailable(name, key) {
    const t = now();
    const entry = lookups.get(key);
    if (!entry || t - entry.start > 60_000) lookups.set(key, { start: t, n: 1 });
    else if (++entry.n > AVAILABLE_PER_MINUTE) throw tooMany('Too many checks. Wait a minute.');
    // Safety valve so the Map cannot grow forever.
    if (lookups.size > 10_000) lookups.clear();
    if (!USERNAME.test(name)) return { available: false, valid: false };
    return { available: !(await db.findUserByName(name)), valid: true };
  }

  /** The logged-in user, or null if missing or suspended. */
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
