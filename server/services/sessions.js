// Service layer: manages a user's login sessions across devices (virtual identity theme).
// Reads the session store directly to list, end or count a user's sessions.

const crypto = require('node:crypto');

/**
 * Finds every live session that belongs to a user.
 * With the MongoDB store it queries the sessions collection; with the memory store (tests) it scans all.
 * @returns {Promise<Array<[string, object]>>} pairs of [sessionId, sessionData]
 */
async function sessionsFor(store, userId) {
  if (store.collectionP) {
    const collection = await store.collectionP;
    const docs = await collection.find({ 'session.userId': String(userId), expires: { $gt: new Date() } }, { projection: { _id: 1, session: 1 } }).toArray();
    return docs.map((d) => [String(d._id), typeof d.session === 'string' ? JSON.parse(d.session) : d.session]);
  }
  const all = await new Promise((resolve, reject) => store.all((err, s) => (err ? reject(err) : resolve(s ?? {}))));
  return Object.entries(all).filter(([, s]) => s?.userId === String(userId));
}
const sessionIdsFor = async (store, userId) => (await sessionsFor(store, userId)).map(([sid]) => sid);

// The real session ID is secret (it is the cookie value), so the browser only ever sees
// a short SHA-256 "handle" of it. The handle cannot be turned back into the ID.
const handleOf = (sid) => crypto.createHash('sha256').update(sid).digest('hex').slice(0, 16);

/** Lists a user's sessions for the account page, most recently active first. */
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

/** Ends one session chosen by its handle; only this user's sessions are searched. */
async function endSessionByHandle(store, userId, handle) {
  const sid = (await sessionIdsFor(store, userId)).find((id) => handleOf(id) === handle);
  if (!sid) return null;
  await destroy(store, sid);
  return sid;
}

const destroy = (store, sid) => new Promise((resolve, reject) => store.destroy(sid, (err) => (err ? reject(err) : resolve())));

/**
 * Ends all of a user's sessions (e.g. after a password change or suspension).
 * @param {object} opts keepSid: a session to keep (the one making the change)
 * @returns {Promise<number>} how many were ended
 */
async function endSessionsFor(store, userId, { keepSid = null } = {}) {
  const ids = (await sessionIdsFor(store, userId)).filter((sid) => sid !== keepSid);
  for (const sid of ids) await destroy(store, sid);
  return ids.length;
}

async function countSessionsFor(store, userId) {
  return (await sessionIdsFor(store, userId)).length;
}

/**
 * Disconnects the user's live Socket.io connections too, so a logged-out or
 * suspended user is kicked out of an online match straight away.
 */
function disconnectSocketsFor(io, userId, { keepSid = null } = {}) {
  if (!io) return;
  const target = io.in(`user:${userId}`);
  (keepSid ? target.except(`sid:${keepSid}`) : target).disconnectSockets(true);
}

/**
 * Creates the session manager used by the services.
 * @param {object} deps store: the express-session store; getIo: returns the Socket.io server (set later)
 */
function createSessionManager({ store, getIo = () => undefined }) {
  return {
    list: (userId, currentSid) => listSessionsFor(store, userId, currentSid),
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
