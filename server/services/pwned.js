// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';

function createPwnedCheck({ fetchImpl = fetch, timeoutMs = 2500, log = console } = {}) {
  return async function checkPassword(password) {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    try {
      const res = await fetchImpl(RANGE_URL + prefix, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'Banana-Brigade-student-project' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const line of (await res.text()).split('\n')) {
        const [s, n] = line.trim().split(':');
        if (s === suffix) {
          const count = Number(n);
          return { pwned: count > 0, count, checked: true };
        }
      }
      return { pwned: false, count: 0, checked: true };
    } catch (err) {
      log.warn(`[pwned passwords] check skipped, password allowed: ${err.message}`);
      return { pwned: false, count: 0, checked: false };
    }
  };
}

const noPwnedCheck = async () => ({ pwned: false, count: 0, checked: false });

module.exports = { createPwnedCheck, noPwnedCheck, RANGE_URL };
