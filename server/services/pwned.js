// Checks a new password against Have I Been Pwned (haveibeenpwned.com), the list of
// passwords seen in real data breaches, without ever sending the password.
//
// k-anonymity: the password is hashed with SHA-1 and only the first 5 hex characters
// of the hash are sent (https://api.pwnedpasswords.com/range/ABCDE). The service
// answers with every hash suffix that starts with those 5 characters (hundreds of
// them) and how often each was seen; we look for ours in that list here. So the
// service never learns the password or even its full hash. "Add-Padding" asks it to
// pad the answer with fake entries, so its size does not give anything away either.
//
// If the service is slow or down, the password is allowed (fail open) and a warning is
// logged: a breach check is a bonus, not a reason to stop people signing up.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';

function createPwnedCheck({ fetchImpl = fetch, timeoutMs = 2500, log = console } = {}) {
  // Returns { pwned, count, checked }; checked is false when the service could not be asked.
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
          return { pwned: count > 0, count, checked: true };   // padding lines have a count of 0
        }
      }
      return { pwned: false, count: 0, checked: true };
    } catch (err) {
      log.warn(`[pwned passwords] check skipped, password allowed: ${err.message}`);
      return { pwned: false, count: 0, checked: false };
    }
  };
}

// Used by tests and when the check is switched off (PWNED_CHECK=off).
const noPwnedCheck = async () => ({ pwned: false, count: 0, checked: false });

module.exports = { createPwnedCheck, noPwnedCheck, RANGE_URL };
