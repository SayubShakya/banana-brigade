// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');
const crypto = require('node:crypto');
const { after } = require('node:test');
const { MongoMemoryServer } = require('mongodb-memory-server');
const http = require('node:http');
const { createApp } = require('../../server/app');
const { attachRealtime } = require('../../server/realtime/socket');
const { openDatabase } = require('../../server/repositories');

if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync('/opt/homebrew/bin/mongod')) {
  process.env.MONGOMS_SYSTEM_BINARY = '/opt/homebrew/bin/mongod';
}

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

function client(base, { headers = {} } = {}) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers, ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
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
