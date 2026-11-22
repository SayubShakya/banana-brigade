// Real-time layer: sets up the Socket.io server for online matches (event-driven theme).
// It reuses the same login session cookie as the REST API, so only logged-in players connect.

const { Server } = require('socket.io');
const { createRooms } = require('./rooms');

/**
 * Attaches Socket.io to the HTTP server.
 * @param {import('http').Server} httpServer the server Express runs on
 * @param {import('express').Express} app the Express app (its locals hold the db, pool, etc.)
 * @param {object} [opts] matchOptions: overrides for tests (e.g. faster ticks)
 * @returns {{io, rooms}} the Socket.io server and the room manager
 */
function attachRealtime(httpServer, app, { matchOptions } = {}) {
  const { sessionMiddleware, db, pool, puzzleStore, achievements, eventLog } = app.locals;
  const io = new Server(httpServer, {
    // Size limit: a single socket message may be at most 16 KB.
    maxHttpBufferSize: 16 * 1024,
    serveClient: false,
  });

  app.locals.io = io;
  // Run the express-session middleware on the WebSocket handshake, so socket.request.session works.
  io.engine.use(sessionMiddleware);
  // Connection guard: refuse the socket unless the session belongs to a real, unsuspended user.
  io.use(async (socket, next) => {
    const s = socket.request.session;
    if (!s?.userId) return next(new Error('Log in to play online'));
    const user = await db.findUserById(s.userId).catch(() => null);
    if (!user || user.suspended) return next(new Error('Log in to play online'));
    // Remember who this socket is, and join personal rooms so the server can message
    // (or disconnect) all of a user's sockets, or all sockets of one session.
    socket.data.userId = s.userId;
    socket.data.username = s.username;
    socket.join(`user:${s.userId}`);
    socket.join(`sid:${socket.request.sessionID}`);
    next();
  });

  const rooms = createRooms({ io, db, pool, puzzleStore, achievements, eventLog, matchOptions });

  // Event wiring: every activity log event is pushed live to admins watching the feed.
  eventLog.onEvent((event) => io.to('admins').emit('server:event', event));
  io.on('connection', (socket) => {
    /**
     * 'events:watch' handler: an admin subscribes to the live activity feed.
     * The role is checked in the database; the ack callback gets the recent events.
     */
    socket.on('events:watch', async (ack) => {
      const user = await db.findUserById(socket.data.userId).catch(() => null);
      if (user?.role !== 'admin') return typeof ack === 'function' && ack({ error: 'Admins only' });
      socket.join('admins');
      if (typeof ack === 'function') ack({ ok: true, recent: eventLog.recent() });
    });
    // 'events:stop' handler: stop receiving the feed.
    socket.on('events:stop', () => socket.leave('admins'));
  });
  return { io, rooms };
}

module.exports = { attachRealtime };
