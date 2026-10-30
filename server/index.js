// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const http = require('node:http');
const { MongoStore } = require('connect-mongo');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createPwnedCheck } = require('./services/pwned');
const { attachRealtime } = require('./realtime/socket');
const { createPuzzlePool } = require('./services/pool');
const { openDatabase } = require('./repositories');
const { createBananaApi } = require('./services/bananaApi');

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
for (const w of config.warnings) console.warn(w);

async function main() {
  let db;
  try {
    db = await openDatabase(config.mongodbUri);
  } catch (err) {
    console.error(`Cannot reach MongoDB at ${config.mongodbUri.replace(/\/\/[^@]*@/, '//***@')}: ${err.message}`);
    console.error('Start it with:  brew services start mongodb-community   (or set MONGODB_URI in .env)');
    process.exit(1);
  }
  const sessionStore = MongoStore.create({
    client: db.connection.getClient(), collectionName: 'sessions', ttl: config.sessionTtlSeconds, stringify: false,
  });
  const bananaApi = createBananaApi({ baseUrl: config.bananaApiUrl, timeoutMs: config.bananaApiTimeoutMs });
  const pool = createPuzzlePool({
    fetchPuzzle: bananaApi.fetchPuzzle, apiStats: bananaApi.stats,
    store: { load: (n) => db.loadReservePuzzles(n), save: (p) => db.saveReservePuzzle(p) },
  });
  const loaded = await pool.loadReserve().catch(() => 0);
  if (loaded) console.log(`Loaded ${loaded} saved Banana puzzles as a reserve.`);
  const app = createApp({
    db, bananaApi, pool, sessionStore,
    sessionSecret: config.sessionSecret, production: config.production, appUrl: config.appUrl,
    pwnedCheck: config.pwnedCheck ? createPwnedCheck() : undefined,
  });

  const server = http.createServer(app);
  attachRealtime(server, app);
  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(`Port ${config.port} is already in use. Stop the other program, run ./run.sh (it stops an older Banana Brigade), or set PORT, e.g. PORT=3105 npm start.`);
    process.exit(1);
  });
  server.listen(config.port, () => {
    console.log(`Banana Brigade running at http://localhost:${config.port} (MongoDB connected, WebSocket ready)`);
    pool.warmUp();
    pool.startSampling();
  });
}

main();
