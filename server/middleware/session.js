// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const session = require('express-session');

const SESSION_COOKIE = 'brigade.sid';

function createSessionMiddleware({ secret, store, production }) {
  return session({
    name: SESSION_COOKIE,
    secret,
    store,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      maxAge: 2 * 60 * 60 * 1000,
    },
  });
}

module.exports = { createSessionMiddleware, SESSION_COOKIE, MemoryStore: session.MemoryStore };
