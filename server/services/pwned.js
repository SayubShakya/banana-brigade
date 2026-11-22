// Service layer: "Have I Been Pwned" password check (virtual identity theme).
// Warns or blocks passwords that appear in known data breaches.

const crypto = require('node:crypto');

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';

/**
 * Creates the breached-password checker. It uses k-anonymity: only the first 5
 * characters of the password's SHA-1 hash are sent, so the password itself (and even
 * its full hash) never leaves the server.
 * @param {object} opts fetchImpl (fake fetch in tests), timeoutMs, log
 * @returns {(password: string) => Promise<{pwned: boolean, count: number, checked: boolean}>}
 */
function createPwnedCheck({ fetchImpl = fetch, timeoutMs = 2500, log = console } = {}) {
  return async function checkPassword(password) {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    try {
      const res = await fetchImpl(RANGE_URL + prefix, {
        // Add-Padding makes every reply a similar size, so traffic watchers learn nothing.
        headers: { 'Add-Padding': 'true', 'User-Agent': 'Banana-Brigade-student-project' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // The reply lists every hash suffix with that prefix and how often it was seen in breaches.
      for (const line of (await res.text()).split('\n')) {
        const [s, n] = line.trim().split(':');
        if (s === suffix) {
          const count = Number(n);
          return { pwned: count > 0, count, checked: true };
        }
      }
      return { pwned: false, count: 0, checked: true };
      // Fail open: if the service is down or slow, sign-up still works (checked: false).
    } catch (err) {
      log.warn(`[pwned passwords] check skipped, password allowed: ${err.message}`);
      return { pwned: false, count: 0, checked: false };
    }
  };
}

// Used when PWNED_CHECK=off (e.g. tests or offline development).
const noPwnedCheck = async () => ({ pwned: false, count: 0, checked: false });

module.exports = { createPwnedCheck, noPwnedCheck, RANGE_URL };
