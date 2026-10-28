// Test helpers: start the app on a random port with an in-memory MongoDB and a
// fake Banana API, and a tiny client that keeps the session cookie like a browser.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');
const crypto = require('node:crypto');
const { after } = require('node:test');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('node:http');
const { createApp } = require('../server/app');
const { attachRealtime } = require('../server/realtime/socket');
const { openDatabase } = require('../server/db');

// Use the locally installed mongod if there is one (no download); CI downloads one.
if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync('/opt/homebrew/bin/mongod')) {
  process.env.MONGOMS_SYSTEM_BINARY = '/opt/homebrew/bin/mongod';
}

// One throw-away MongoDB per test file; every server gets its own empty database.
let mongo = null;
const opened = [];
async function freshDatabase() {
  mongo ??= await MongoMemoryServer.create();
  const db = await openDatabase(mongo.getUri(`t_${crypto.randomUUID().slice(0, 8)}`));
  opened.push(db);
  return db;
}
after(async () => {
  for (const db of opened) await db.close();
  if (mongo) await mongo.stop();
});

const IMAGE = 'https://www.sanfoh.com/uob/banana/data/t1.png';
const fakeApi = (solution = 7) => ({ fetchPuzzle: async () => ({ image: IMAGE, solution }) });

async function startServer({ bananaApi = fakeApi(), db, matchOptions } = {}) {
  db ??= await freshDatabase();
  const app = createApp({ db, bananaApi, sessionSecret: 'test-secret' });
  const server = http.createServer(app);
  const realtime = attachRealtime(server, app, { matchOptions });
  server.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${server.address().port}`;
  const close = () => new Promise((r) => { realtime.io.close(); server.close(r); });
  return { base, db, realtime, close };
}

// Remembers the session cookie between requests, as a browser would.
function client(base) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
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
