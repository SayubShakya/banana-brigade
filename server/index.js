// Entry point: reads the settings (config/), connects to MongoDB and starts the
// server.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const http = require('node:http');
const { MongoStore } = require('connect-mongo');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createPwnedCheck } = require('./services/pwned');
const { attachRealtime } = require('./realtime/socket');
const { createPuzzlePool } = require('./services/pool');
const { openDatabase } = require('./models/db');
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
  // Sessions are kept in MongoDB, so players stay logged in when the server restarts.
  // stringify: false stores each session as a document, so the server can find and
  // end every session of one player ("log out of all devices").
  const sessionStore = MongoStore.create({
    client: db.connection.getClient(), collectionName: 'sessions', ttl: config.sessionTtlSeconds, stringify: false,
  });
  const bananaApi = createBananaApi({ baseUrl: config.bananaApiUrl, timeoutMs: config.bananaApiTimeoutMs });
  // The reserve is kept in MongoDB, so a restart while the Banana API is down still has puzzles.
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

  // One HTTP server for the web pages, the JSON API and the WebSocket (Socket.io).
  const server = http.createServer(app);
  attachRealtime(server, app);
  // A clear message instead of a stack trace when the port is taken.
  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(`Port ${config.port} is already in use. Stop the other program, run ./run.sh (it stops an older Banana Brigade), or set PORT, e.g. PORT=3105 npm start.`);
    process.exit(1);
  });
  server.listen(config.port, () => {
    console.log(`Banana Brigade running at http://localhost:${config.port} (MongoDB connected, WebSocket ready)`);
    pool.warmUp(); // have puzzles ready before the first player asks
    pool.startSampling(); // Banana API health history for the admin screen
  });
}

main();
