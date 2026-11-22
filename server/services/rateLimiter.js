// Service layer: login rate limiting and lockout (virtual identity theme).
// Slows down password guessing; counters are stored in MongoDB.

const MINUTE = 60 * 1000;
// Login: 5 tries per username+IP and 20 per IP in 10 minutes. Reset: 5 per IP in 15 min. Guest: 10 per IP per hour.
const LIMITS = {
  login: { perNameAndIp: 5, perIp: 20, windowMs: 10 * MINUTE },
  reset: { perIp: 5, windowMs: 15 * MINUTE },
  guest: { perIp: 10, windowMs: 60 * MINUTE },
};

const minutesLeft = (resetAt, now) => Math.max(1, Math.ceil((resetAt - now) / MINUTE));

/**
 * Creates the rate limiter.
 * @param {object} deps db (rate limit repository), now (clock)
 */
function createRateLimiter({ db, now = () => Date.now() }) {
  return {
    LIMITS,

    /**
     * Counts a login attempt. Two counters: username+IP (stops guessing one account)
     * and IP only (stops one machine trying many accounts).
     * @returns {Promise<{blocked, waitMin, left, succeeded}>} succeeded() is called after a
     *   correct password to clear the username counter and give back the IP count
     */
    async login(username, ip) {
      const { perNameAndIp, perIp, windowMs } = LIMITS.login;
      const name = String(username).toLowerCase();
      const pairKey = `login:${name}|${ip}`;
      const ipKey = `login-ip:${ip}`;
      const t = now();
      const [pair, fromIp] = await Promise.all([
        db.bumpCounter(pairKey, { windowMs, now: t, ip, username: name }),
        db.bumpCounter(ipKey, { windowMs, now: t, ip }),
      ]);
      const pairBlocked = pair.n > perNameAndIp;
      const blocked = pairBlocked || fromIp.n > perIp;
      return {
        blocked,
        waitMin: blocked ? minutesLeft(pairBlocked ? pair.resetAt : fromIp.resetAt, t) : 0,
        left: perNameAndIp - pair.n,
        succeeded: () => Promise.all([db.clearCounter(pairKey), db.undoCounter(ipKey)]),
      };
    },

    /**
     * Counts one request of a simple kind ('reset' or 'guest') per IP.
     * @returns {Promise<{allowed: boolean, waitMin: number}>}
     */
    async hit(kind, ip) {
      const { perIp, windowMs } = LIMITS[kind];
      const t = now();
      const count = await db.bumpCounter(`${kind}-ip:${ip}`, { windowMs, now: t, ip });
      return { allowed: count.n <= perIp, waitMin: count.n > perIp ? minutesLeft(count.resetAt, t) : 0 };
    },

    // Admin action: unlock an account by clearing its failed-login counters.
    clearName: (username) => db.clearFailedLogins(username),
  };
}

module.exports = { createRateLimiter, LIMITS };
