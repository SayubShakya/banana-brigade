// authFields.js: helpers for the register form: password strength meter and username check.
import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';

/**
 * strength: score a password from 0 to 4 (length, upper+lower case, digit, symbol).
 * Only a hint for the user; the server applies the real password rules.
 */
export function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}
export const LEVELS = ['Too weak', 'Weak', 'OK', 'Strong', 'Very strong'];
const NAME = /^[A-Za-z0-9_]{3,16}$/;

/**
 * useNameHint: checks if a username is free while the player types.
 * @param {string} name     the username typed so far.
 * @param {boolean} active  only check in register mode.
 * @returns {{ok: boolean, text: string}|null} the hint to show.
 * Waits 400 ms after the last key (debounce), then calls GET /api/v1/auth/available.
 */
export function useNameHint(name, active) {
  const [hint, setHint] = useState(null);
  useEffect(() => {
    setHint(null);
    if (!active || !name) return undefined;
    if (!NAME.test(name)) { setHint({ ok: false, text: '3–16 letters, numbers or _' }); return undefined; }
    let stale = false;
    const timer = setTimeout(() => {
      api.available(name)
        .then(({ available }) => !stale && setHint(available ? { ok: true, text: 'Name is free' } : { ok: false, text: 'That name is taken' }))
        .catch(() => {});
    }, 400);
    return () => { stale = true; clearTimeout(timer); };
  }, [name, active]);
  return hint;
}
