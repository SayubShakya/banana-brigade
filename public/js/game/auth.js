// Talks to the account endpoints and drives the login / register screen.
// The browser never sees the password hash or the session id: the server sets an
// HttpOnly cookie, and fetch sends it back automatically on every request.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { emit } from '../eventBus.js';

const $ = (id) => document.getElementById(id);

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Server returned ${res.status}`), { status: res.status });
  return data;
}

export const fetchMe = () => call('GET', '/api/auth/me');
export const logout = () => call('POST', '/api/auth/logout');

// Rough strength hint shown while typing (the server only enforces a minimum length).
function strength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

export function initLoginScreen() {
  const form = $('auth-form');
  const tabs = document.querySelectorAll('[data-auth-tab]');
  let mode = 'login';

  function setMode(next) {
    mode = next;
    tabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.authTab === mode ? 'true' : 'false'));
    form.dataset.mode = mode;
    $('auth-submit').textContent = mode === 'login' ? 'Log in' : 'Create account';
    $('auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('auth-error').textContent = '';
  }

  tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.authTab)));

  $('auth-password').addEventListener('input', (e) => {
    const s = strength(e.target.value);
    $('auth-meter').dataset.level = e.target.value ? s : '';
    $('auth-meter-text').textContent = e.target.value ? ['Too weak', 'Weak', 'OK', 'Strong', 'Very strong'][s] : '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('auth-username').value.trim();
    const password = $('auth-password').value;
    const confirm = $('auth-confirm').value;
    $('auth-error').textContent = '';
    if (mode === 'register' && password !== confirm) {
      $('auth-error').textContent = 'The two passwords do not match.';
      return;
    }
    $('auth-submit').disabled = true;
    try {
      const { user } = await call('POST', mode === 'login' ? '/api/auth/login' : '/api/auth/register', { username, password });
      form.reset();
      $('auth-meter').dataset.level = '';
      $('auth-meter-text').textContent = '';
      emit('auth:login', { user, isNew: mode === 'register' });
    } catch (err) {
      $('auth-error').textContent = err.message;
    } finally {
      $('auth-submit').disabled = false;
    }
  });

  setMode('login');
}
