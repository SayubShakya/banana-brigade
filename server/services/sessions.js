// Finds, lists and ends the sessions that belong to one player, for "where you're
// signed in", "log out of all devices", password changes and account deletion. A session is just a record in
// the session store, so ending it on the server logs that device out at its next
// request, even though its cookie is still in the browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');

// connect-mongo (the real server) keeps one document per session, so one query
// finds them all. MemoryStore (the tests) has no query, so we walk store.all().
// Returns [sid, session] pairs.
async function sessionsFor(store, userId) {
  if (store.collectionP) {
    const collection = await store.collectionP;
    const docs = await collection.find({ 'session.userId': String(userId), expires: { $gt: new Date() } }, { projection: { _id: 1, session: 1 } }).toArray();
    return docs.map((d) => [String(d._id), typeof d.session === 'string' ? JSON.parse(d.session) : d.session]);
  }
  const all = await new Promise((resolve, reject) => store.all((err, s) => (err ? reject(err) : resolve(s ?? {}))));
  // MemoryStore returns { sid: session }; anything else is treated the same way.
  return Object.entries(all).filter(([, s]) => s?.userId === String(userId));
}
const sessionIdsFor = async (store, userId) => (await sessionsFor(store, userId)).map(([sid]) => sid);

// The browser is only ever shown a handle (a hash of the session id), never the id
// itself: the id is what the cookie holds, so showing it would let a script that
// reads the page take over that session.
const handleOf = (sid) => crypto.createHash('sha256').update(sid).digest('hex').slice(0, 16);

// "Where you're signed in": one row per live session, newest use first.
async function listSessionsFor(store, userId, currentSid) {
  return (await sessionsFor(store, userId))
    .map(([sid, s]) => ({
      handle: handleOf(sid),
      device: s.device ?? 'Unknown device',
      createdAt: s.createdAt ?? null,
      lastSeen: s.lastSeen ?? s.createdAt ?? null,
      expires: s.cookie?.expires ? new Date(s.cookie.expires).toISOString() : null,
      current: sid === currentSid,
    }))
    .sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
}

// Ends the one session with this handle, if it belongs to the player; returns its id
// (so its sockets can be dropped too) or null.
async function endSessionByHandle(store, userId, handle) {
  const sid = (await sessionIdsFor(store, userId)).find((id) => handleOf(id) === handle);
  if (!sid) return null;
  await destroy(store, sid);
  return sid;
}

const destroy = (store, sid) => new Promise((resolve, reject) => store.destroy(sid, (err) => (err ? reject(err) : resolve())));

// Ends the player's sessions; keepSid lets the device that asked stay logged in.
async function endSessionsFor(store, userId, { keepSid = null } = {}) {
  const ids = (await sessionIdsFor(store, userId)).filter((sid) => sid !== keepSid);
  for (const sid of ids) await destroy(store, sid);
  return ids.length;
}

async function countSessionsFor(store, userId) {
  return (await sessionIdsFor(store, userId)).length;
}

// Ending a session does not close a WebSocket that is already open, so the player's
// live sockets are dropped too (keepSid spares the device that asked). io is
// undefined when the app runs without the realtime server.
function disconnectSocketsFor(io, userId, { keepSid = null } = {}) {
  if (!io) return;
  const target = io.in(`user:${userId}`);
  (keepSid ? target.except(`sid:${keepSid}`) : target).disconnectSockets(true);
}

// The functions above bound to one session store and the Socket.io server, so the
// services can end a player's sessions without knowing about either. getIo is a
// function because the Socket.io server is attached after the app is built.
function createSessionManager({ store, getIo = () => undefined }) {
  return {
    list: (userId, currentSid) => listSessionsFor(store, userId, currentSid),
    // Ends the sessions (keepSid spares the one that asked) and drops their live sockets.
    async endAll(userId, { keepSid = null } = {}) {
      const ended = await endSessionsFor(store, userId, { keepSid });
      disconnectSocketsFor(getIo(), userId, { keepSid });
      return ended;
    },
    async endByHandle(userId, handle) {
      const sid = await endSessionByHandle(store, userId, handle);
      if (sid) getIo()?.in(`sid:${sid}`).disconnectSockets(true);
      return sid;
    },
  };
}

module.exports = { endSessionsFor, countSessionsFor, disconnectSocketsFor, listSessionsFor, endSessionByHandle, handleOf, createSessionManager };
