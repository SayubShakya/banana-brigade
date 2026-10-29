// The server for the end-to-end tests (npm run e2e): the real app with an in-memory
// MongoDB and a fake Banana API whose answer is always 7, so a test can solve a
// puzzle. Never used for real play.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');
const http = require('node:http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../server/app');
const { attachRealtime } = require('../server/realtime/socket');
const { openDatabase } = require('../server/db');

// A 1×1 PNG, so the test needs no network for puzzle pictures.
const IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const fakeBananaApi = { fetchPuzzle: async () => ({ image: IMAGE, solution: 7 }) };
const PORT = Number(process.env.E2E_PORT) || 3199;

(async () => {
  if (!process.env.MONGOMS_SYSTEM_BINARY && fs.existsSync('/opt/homebrew/bin/mongod')) {
    process.env.MONGOMS_SYSTEM_BINARY = '/opt/homebrew/bin/mongod';
  }
  const mongo = await MongoMemoryServer.create();
  const db = await openDatabase(mongo.getUri('brigade_e2e'));
  const app = createApp({ db, bananaApi: fakeBananaApi, sessionSecret: 'e2e-only-secret', sendResetLink: () => {} });
  const server = http.createServer(app);
  attachRealtime(server, app);
  server.listen(PORT, () => console.log(`E2E server on http://localhost:${PORT}`));
  const stop = async () => { server.close(); await db.close(); await mongo.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})();
