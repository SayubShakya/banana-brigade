// Entry point: reads settings from the environment (.env), connects to MongoDB and
// starts the server.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const http = require('node:http');
const { MongoStore } = require('connect-mongo');
const { createApp } = require('./app');
const { createPwnedCheck } = require('./services/pwned');
const { attachRealtime } = require('./realtime/socket');
const { createPuzzlePool } = require('./services/pool');
const { openDatabase } = require('./models/db');
const { createBananaApi, DEFAULT_BASE_URL } = require('./services/bananaApi');

const PORT = Number(process.env.PORT) || 3100;
const production = process.env.NODE_ENV === 'production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/banana_brigade';

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === 'change-me') {
  if (production) {
    console.error('SESSION_SECRET must be set in production.');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET not set: using a random one, so everyone is logged out on restart.');
}

// Point BANANA_API_URL at a broken address to demonstrate the error handling.
const baseUrl = process.env.BANANA_API_URL || DEFAULT_BASE_URL;
if (baseUrl !== DEFAULT_BASE_URL) console.warn(`Using Banana API at ${baseUrl}`);

async function main() {
  let db;
  try {
    db = await openDatabase(MONGODB_URI);
  } catch (err) {
    console.error(`Cannot reach MongoDB at ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}: ${err.message}`);
    console.error('Start it with:  brew services start mongodb-community   (or set MONGODB_URI in .env)');
    process.exit(1);
  }
  // Sessions are kept in MongoDB, so players stay logged in when the server restarts.
  // stringify: false stores each session as a document, so the server can find and
  // end every session of one player ("log out of all devices").
  const sessionStore = MongoStore.create({
    client: db.connection.getClient(), collectionName: 'sessions', ttl: 2 * 60 * 60, stringify: false,
  });
  const bananaApi = createBananaApi({ baseUrl, timeoutMs: Number(process.env.BANANA_API_TIMEOUT_MS) || 5000 });
  const pool = createPuzzlePool({ fetchPuzzle: bananaApi.fetchPuzzle, apiStats: bananaApi.stats });
  if (production && !process.env.APP_URL) console.warn('APP_URL is not set: password reset links will use the Host header of the request.');
  const app = createApp({ db, bananaApi, pool, sessionSecret, sessionStore, production, appUrl: process.env.APP_URL || null,
    pwnedCheck: process.env.PWNED_CHECK === 'off' ? undefined : createPwnedCheck() });

  // One HTTP server for the web pages, the JSON API and the WebSocket (Socket.io).
  const server = http.createServer(app);
  attachRealtime(server, app);
  server.listen(PORT, () => {
    console.log(`Banana Brigade running at http://localhost:${PORT} (MongoDB connected, WebSocket ready)`);
    pool.warmUp(); // have puzzles ready before the first player asks
    pool.startSampling(); // Banana API health history for the admin screen
  });
}

main();
