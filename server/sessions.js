// Finds and ends every session that belongs to one player, for "log out of all
// devices", password changes and account deletion. A session is just a record in
// the session store, so ending it on the server logs that device out at its next
// request, even though its cookie is still in the browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

// connect-mongo (the real server) keeps one document per session, so one query
// finds them all. MemoryStore (the tests) has no query, so we walk store.all().
async function sessionIdsFor(store, userId) {
  if (store.collectionP) {
    const collection = await store.collectionP;
    const docs = await collection.find({ 'session.userId': String(userId), expires: { $gt: new Date() } }, { projection: { _id: 1 } }).toArray();
    return docs.map((d) => String(d._id));
  }
  const all = await new Promise((resolve, reject) => store.all((err, s) => (err ? reject(err) : resolve(s ?? {}))));
  // MemoryStore returns { sid: session }; anything else is treated the same way.
  return Object.entries(all).filter(([, s]) => s?.userId === String(userId)).map(([sid]) => sid);
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

module.exports = { endSessionsFor, countSessionsFor, disconnectSocketsFor };
