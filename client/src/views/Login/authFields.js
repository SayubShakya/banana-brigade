// Sign-up helpers shared by the login screen and "Save your progress": the live
// "is this name free?" hint and the password strength meter.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';

// Rough strength hint while typing (the server enforces the minimum length).
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

// Asks the server whether the name is free, 400 ms after the player stops typing,
// so a fast typist sends one request instead of one per key.
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
        .catch(() => {});   // the hint is only a help; register still checks
    }, 400);
    return () => { stale = true; clearTimeout(timer); };
  }, [name, active]);
  return hint;
}

