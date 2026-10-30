// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { Server } = require('socket.io');
const { createRooms } = require('./rooms');

function attachRealtime(httpServer, app, { matchOptions } = {}) {
  const { sessionMiddleware, db, pool, puzzleStore, achievements, eventLog } = app.locals;
  const io = new Server(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    serveClient: false,
  });

  app.locals.io = io;
  io.engine.use(sessionMiddleware);
  io.use(async (socket, next) => {
    const s = socket.request.session;
    if (!s?.userId) return next(new Error('Log in to play online'));
    const user = await db.findUserById(s.userId).catch(() => null);
    if (!user || user.suspended) return next(new Error('Log in to play online'));
    socket.data.userId = s.userId;
    socket.data.username = s.username;
    socket.join(`user:${s.userId}`);
    socket.join(`sid:${socket.request.sessionID}`);
    next();
  });

  const rooms = createRooms({ io, db, pool, puzzleStore, achievements, eventLog, matchOptions });

  eventLog.onEvent((event) => io.to('admins').emit('server:event', event));
  io.on('connection', (socket) => {
    socket.on('events:watch', async (ack) => {
      const user = await db.findUserById(socket.data.userId).catch(() => null);
      if (user?.role !== 'admin') return typeof ack === 'function' && ack({ error: 'Admins only' });
      socket.join('admins');
      if (typeof ack === 'function') ack({ ok: true, recent: eventLog.recent() });
    });
    socket.on('events:stop', () => socket.leave('admins'));
  });
  return { io, rooms };
}

module.exports = { attachRealtime };
