// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const MINUTE = 60 * 1000;
const LIMITS = {
  login: { perNameAndIp: 5, perIp: 20, windowMs: 10 * MINUTE },
  reset: { perIp: 5, windowMs: 15 * MINUTE },
  guest: { perIp: 10, windowMs: 60 * MINUTE },
};

const minutesLeft = (resetAt, now) => Math.max(1, Math.ceil((resetAt - now) / MINUTE));

function createRateLimiter({ db, now = () => Date.now() }) {
  return {
    LIMITS,

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

    async hit(kind, ip) {
      const { perIp, windowMs } = LIMITS[kind];
      const t = now();
      const count = await db.bumpCounter(`${kind}-ip:${ip}`, { windowMs, now: t, ip });
      return { allowed: count.n <= perIp, waitMin: count.n > perIp ? minutesLeft(count.resetAt, t) : 0 };
    },

    clearName: (username) => db.clearFailedLogins(username),
  };
}

module.exports = { createRateLimiter, LIMITS };
