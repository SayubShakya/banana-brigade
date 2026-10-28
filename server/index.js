// Entry point: reads settings from the environment (.env), opens the database and
// starts the server.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const path = require('node:path');
const { createApp } = require('./app');
const { createPuzzlePool } = require('./pool');
const { openDatabase } = require('./db');
const { createBananaApi, DEFAULT_BASE_URL } = require('./services/bananaApi');

const PORT = Number(process.env.PORT) || 3100;
const production = process.env.NODE_ENV === 'production';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'brigade.db');

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

const db = openDatabase(DB_FILE);
const bananaApi = createBananaApi({ baseUrl, timeoutMs: Number(process.env.BANANA_API_TIMEOUT_MS) || 5000 });
const pool = createPuzzlePool({ fetchPuzzle: bananaApi.fetchPuzzle });
const app = createApp({ db, bananaApi, pool, sessionSecret, production });

app.listen(PORT, () => {
  console.log(`Banana Brigade running at http://localhost:${PORT}`);
  pool.warmUp(); // have puzzles ready before the first player asks
});
