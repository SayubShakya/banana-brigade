// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

function createRateLimitRepository(m) {
  return {
    async bumpCounter(key, { windowMs, now = Date.now(), username = null, ip = null }) {
      for (let attempt = 0; ; attempt++) {
        try {
          await m.RateLimit.deleteOne({ key, expiresAt: { $lte: new Date(now) } });
          const doc = await m.RateLimit.findOneAndUpdate(
            { key },
            { $inc: { n: 1 }, $setOnInsert: { username, ip, expiresAt: new Date(now + windowMs) } },
            { upsert: true, returnDocument: 'after', lean: true },
          );
          return { n: doc.n, resetAt: doc.expiresAt.getTime() };
        } catch (err) {
          if (err.code !== 11000 || attempt > 0) throw err;
        }
      }
    },
    undoCounter: (key) => m.RateLimit.updateOne({ key, n: { $gt: 0 } }, { $inc: { n: -1 } }),
    clearCounter: (key) => m.RateLimit.deleteOne({ key }),
    clearFailedLogins: (username) => m.RateLimit.deleteMany({ username: String(username).toLowerCase() }),
    countersFor: (username) => m.RateLimit.countDocuments({ username: String(username).toLowerCase() }),
  };
}

module.exports = { createRateLimitRepository };
