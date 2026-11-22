// Middleware layer: the login session cookie (virtual identity theme).
// express-session keeps the session data on the server (MongoDB store) and
// only gives the browser a signed random ID in the "brigade.sid" cookie.
const session = require('express-session');

const SESSION_COOKIE = 'brigade.sid';

/**
 * Creates the express-session middleware.
 * @param {object} opts
 * @param {string} opts.secret key used to sign the cookie so it cannot be forged
 * @param {object} opts.store where sessions are saved (MongoDB in production, memory in tests)
 * @param {boolean} opts.production when true the cookie is only sent over HTTPS
 */
function createSessionMiddleware({ secret, store, production }) {
  return session({
    name: SESSION_COOKIE,
    secret,
    store,
    // Do not save empty sessions: visitors who never log in get no cookie.
    resave: false,
    saveUninitialized: false,
    cookie: {
      // HttpOnly: page JavaScript cannot read the cookie, which blocks cookie theft by XSS.
      // SameSite=lax: the cookie is not sent on cross-site POSTs, which helps against CSRF.
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      // Session lasts 2 hours unless "remember me" makes it longer.
      maxAge: 2 * 60 * 60 * 1000,
    },
  });
}

module.exports = { createSessionMiddleware, SESSION_COOKIE, MemoryStore: session.MemoryStore };
