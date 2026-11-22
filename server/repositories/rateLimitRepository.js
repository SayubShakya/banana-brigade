// Repository layer: counters for login rate limiting and lockout, stored in MongoDB
// so limits still apply after a restart.

/**
 * Creates the rate limit repository.
 * @param {object} m the Mongoose models
 */
function createRateLimitRepository(m) {
  return {
    /**
     * Adds 1 to a counter (e.g. failed logins for a username) inside a time window.
     * @param {string} key counter name
     * @param {object} opts windowMs: window length; username/ip: saved for admin clear-up
     * @returns {Promise<{n: number, resetAt: number}>} new count and when the window ends
     */
    async bumpCounter(key, { windowMs, now = Date.now(), username = null, ip = null }) {
      for (let attempt = 0; ; attempt++) {
        try {
          // Delete an expired counter ourselves, because MongoDB's TTL clean-up only runs about once a minute.
          await m.RateLimit.deleteOne({ key, expiresAt: { $lte: new Date(now) } });
          // Upsert: create the counter if missing, then increment it, in one atomic step.
          const doc = await m.RateLimit.findOneAndUpdate(
            { key },
            { $inc: { n: 1 }, $setOnInsert: { username, ip, expiresAt: new Date(now + windowMs) } },
            { upsert: true, returnDocument: 'after', lean: true },
          );
          return { n: doc.n, resetAt: doc.expiresAt.getTime() };
        } catch (err) {
          // Two requests creating the same counter at once: retry once after the duplicate key error.
          if (err.code !== 11000 || attempt > 0) throw err;
        }
      }
    },
    // Take back one count (e.g. when the login turned out to be correct).
    undoCounter: (key) => m.RateLimit.updateOne({ key, n: { $gt: 0 } }, { $inc: { n: -1 } }),
    clearCounter: (key) => m.RateLimit.deleteOne({ key }),
    // Admin action: remove every lockout counter for a username.
    clearFailedLogins: (username) => m.RateLimit.deleteMany({ username: String(username).toLowerCase() }),
    countersFor: (username) => m.RateLimit.countDocuments({ username: String(username).toLowerCase() }),
  };
}

module.exports = { createRateLimitRepository };
