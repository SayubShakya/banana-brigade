// Adds the Socket.io (WebSocket) server to the HTTP server.
//
// A WebSocket starts as a normal HTTP request that carries the brigade.sid session
// cookie. The same express-session middleware reads it, and only sockets with a
// logged-in session are let in. So identity on the WebSocket is exactly the login
// identity, with no extra token for the browser to keep.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { Server } = require('socket.io');
const { createRooms } = require('./rooms');

function attachRealtime(httpServer, app, { matchOptions } = {}) {
  const { sessionMiddleware, db, pool, puzzleStore, achievements } = app.locals;
  const io = new Server(httpServer, {
    maxHttpBufferSize: 16 * 1024,     // controls and answers are tiny
    serveClient: false,
  });

  app.locals.io = io;   // so the account routes can disconnect a player's sockets
  io.engine.use(sessionMiddleware);
  io.use((socket, next) => {
    const s = socket.request.session;
    if (!s?.userId) return next(new Error('Log in to play online'));
    socket.data.userId = s.userId;
    socket.data.username = s.username;
    // Rooms per player and per session, so the HTTP side can drop this player's live
    // sockets on "log out of all devices", a password change or account deletion.
    socket.join(`user:${s.userId}`);
    socket.join(`sid:${socket.request.sessionID}`);
    next();
  });

  const rooms = createRooms({ io, db, pool, puzzleStore, achievements, matchOptions });
  return { io, rooms };
}

module.exports = { attachRealtime };
