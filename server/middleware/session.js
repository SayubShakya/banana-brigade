// The session cookie (express-session). The session itself lives on the server (in
// MongoDB in the real server, in memory in tests); the browser only holds its id.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const session = require('express-session');

const SESSION_COOKIE = 'brigade.sid';

function createSessionMiddleware({ secret, store, production }) {
  return session({
    name: SESSION_COOKIE,
    secret,
    store,
    resave: false,
    saveUninitialized: false,     // no cookie until someone logs in
    cookie: {
      httpOnly: true,             // page JavaScript cannot read it (protects against XSS stealing it)
      sameSite: 'lax',            // not sent with cross-site POSTs (CSRF protection)
      secure: production,         // HTTPS only in production
      maxAge: 2 * 60 * 60 * 1000, // 2 hours
    },
  });
}

module.exports = { createSessionMiddleware, SESSION_COOKIE, MemoryStore: session.MemoryStore };
