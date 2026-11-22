// Shared helpers for the integration tests.
// They start the real Express + Socket.io server on a random free port, backed by a
// throwaway in-memory MongoDB and a fake Banana API, so tests never touch real data or the internet.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { after } = require('node:test');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('node:http');
const { createApp } = require('../../server/app');
const { attachRealtime } = require('../../server/realtime/socket');
const { openDatabase } = require('../../server/repositories');

// On a Mac with Homebrew MongoDB installed, reuse that mongod binary instead of downloading one.
if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync('/opt/homebrew/bin/mongod')) {
  process.env.MONGOMS_SYSTEM_BINARY = '/opt/homebrew/bin/mongod';
}

// One in-memory MongoDB server is shared by the whole test file (started lazily on first use).
let mongo = null;
const opened = [];
// Gives each test its own empty database with a random name, so tests cannot affect each other.
async function freshDatabase() {
  mongo ??= await MongoMemoryServer.create();
  const db = await openDatabase(mongo.getUri(`t_${crypto.randomUUID().slice(0, 8)}`));
  opened.push(db);
  return db;
}
// When all tests in the file have finished, close every database and stop MongoDB.
after(async () => {
  for (const db of opened) await db.close();
  if (mongo) await mongo.stop();
});

// A fake Banana API: always returns the same image and a known answer (7 by default),
// so tests can "solve" the puzzle without calling the real API over HTTPS.
const IMAGE = 'https://www.sanfoh.com/uob/banana/data/t1.png';
const fakeApi = (solution = 7) => ({ fetchPuzzle: async () => ({ image: IMAGE, solution }) });

// Starts the full app (HTTP routes + Socket.io) on port 0, which means "any free port".
// Returns the base URL, the database, the realtime object and a close() function.
async function startServer({ bananaApi = fakeApi(), db, matchOptions, appOptions = {} } = {}) {
  db ??= await freshDatabase();
  const app = createApp({ db, bananaApi, sessionSecret: 'test-secret', ...appOptions });
  const server = http.createServer(app);
  const realtime = attachRealtime(server, app, { matchOptions });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const close = () => new Promise((r) => { realtime.io.close(); server.close(r); });
  return { base, db, realtime, close };
}

// A tiny HTTP client that acts like one browser: it sends JSON and remembers the
// session cookie the server sets, so later requests are "logged in" as the same user.
function client(base, { headers = {} } = {}) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Keep only the "name=value" part of Set-Cookie (drop HttpOnly, Path, etc.).
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    // Some responses have no JSON body; in that case body stays null.
    let json = null;
    try { json = await res.json(); } catch { }
    return { status: res.status, body: json, setCookie: set };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    del: (p, b) => call('DELETE', p, b),
    patch: (p, b) => call('PATCH', p, b ?? {}),
    get cookie() { return cookie; },
  };
}

module.exports = { IMAGE, fakeApi, startServer, client };
