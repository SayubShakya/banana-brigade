// Rate limits for the account routes, counted per IP address in MongoDB (the
// RateLimit counters in models/). Each try is counted with one atomic $inc before
// the work is done, so a burst of requests sent at the same moment cannot all slip
// in under the limit.
//
//   login: 5 tries for one name from one IP, and 20 from one IP across all names, in
//          10 minutes. A stranger typing wrong passwords for your name only locks
//          themselves out. A correct password takes its try back off again.
//   reset: 5 "forgot password" requests from one IP in 15 minutes.
//   guest: 10 new guest accounts from one IP in an hour.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const MINUTE = 60 * 1000;
const LIMITS = {
  login: { perNameAndIp: 5, perIp: 20, windowMs: 10 * MINUTE },
  reset: { perIp: 5, windowMs: 15 * MINUTE },
  guest: { perIp: 10, windowMs: 60 * MINUTE },
};

// Whole minutes until a window ends, at least 1 (for "try again in N min").
const minutesLeft = (resetAt, now) => Math.max(1, Math.ceil((resetAt - now) / MINUTE));

function createRateLimiter({ db, now = () => Date.now() }) {
  return {
    LIMITS,

    // Counts one login try. Returns { blocked, waitMin, left, succeeded() }:
    // left is how many tries this name has from this IP; call succeeded() after a
    // correct password to clear the name's count and give the IP its try back.
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

    // Counts one request of a simple per-IP kind ('reset' or 'guest').
    // Returns { allowed, waitMin }.
    async hit(kind, ip) {
      const { perIp, windowMs } = LIMITS[kind];
      const t = now();
      const count = await db.bumpCounter(`${kind}-ip:${ip}`, { windowMs, now: t, ip });
      return { allowed: count.n <= perIp, waitMin: count.n > perIp ? minutesLeft(count.resetAt, t) : 0 };
    },

    // Forgets every login count for a name (after a password reset or account deletion).
    clearName: (username) => db.clearFailedLogins(username),
  };
}

module.exports = { createRateLimiter, LIMITS };
