// Entry point: starts the real server. Loads config, connects to MongoDB, creates the
// Banana API client and puzzle pool, builds the Express app, then attaches Socket.io.

const http = require('node:http');
const { MongoStore } = require('connect-mongo');
const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { createPwnedCheck } = require('./services/pwned');
const { attachRealtime } = require('./realtime/socket');
const { createPuzzlePool } = require('./services/pool');
const { openDatabase } = require('./repositories');
const { createBananaApi } = require('./services/bananaApi');

// Stop at once with a clear message if the config is invalid (e.g. no SESSION_SECRET in production).
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
for (const w of config.warnings) console.warn(w);

/** Starts everything in order; exits with a helpful message if MongoDB or the port is unavailable. */
async function main() {
  let db;
  try {
    db = await openDatabase(config.mongodbUri);
  } catch (err) {
    // The regex hides any username:password in the MongoDB URI before printing it.
    console.error(`Cannot reach MongoDB at ${config.mongodbUri.replace(/\/\/[^@]*@/, '//***@')}: ${err.message}`);
    console.error('Start it with:  brew services start mongodb-community   (or set MONGODB_URI in .env)');
    process.exit(1);
  }
  // Sessions are stored in MongoDB (collection "sessions"), so logins survive a server restart.
  const sessionStore = MongoStore.create({
    client: db.connection.getClient(), collectionName: 'sessions', ttl: config.sessionTtlSeconds, stringify: false,
  });
  const bananaApi = createBananaApi({ baseUrl: config.bananaApiUrl, timeoutMs: config.bananaApiTimeoutMs });
  // The pool saves good puzzles to MongoDB and reloads them on start (reserve for when the API is down).
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

  // One HTTP server is shared by Express (REST API) and Socket.io (real-time matches).
  const server = http.createServer(app);
  attachRealtime(server, app);
  server.on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(`Port ${config.port} is already in use. Stop the other program, run ./run.sh (it stops an older Banana Brigade), or set PORT, e.g. PORT=3105 npm start.`);
    process.exit(1);
  });
  server.listen(config.port, () => {
    // Start fetching puzzles early and sampling API health every 30 s.
    console.log(`Banana Brigade running at http://localhost:${config.port} (MongoDB connected, WebSocket ready)`);
    pool.warmUp();
    pool.startSampling();
  });
}

main();
