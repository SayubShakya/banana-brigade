// Demo mode: runs the game without installing or setting up MongoDB.
// It starts a temporary in-memory MongoDB, so nothing is saved after the server stops.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  // If mongod is already installed, use it (and its version) instead of downloading a copy.
  const local = ['/opt/homebrew/bin/mongod', '/usr/local/bin/mongod', '/usr/bin/mongod'].find((p) => fs.existsSync(p));
  if (!process.env.MONGOMS_SYSTEM_BINARY && local) {
    process.env.MONGOMS_SYSTEM_BINARY = local;
    const version = /db version v(\d+\.\d+\.\d+)/.exec(execSync(`${local} --version`).toString())?.[1];
    if (version && !process.env.MONGOMS_VERSION) process.env.MONGOMS_VERSION = version;
  }
  // Build the React client first if it has never been built.
  if (!fs.existsSync(path.join(__dirname, '..', 'client', 'dist', 'index.html'))) {
    console.log('Building the React app…');
    execSync('npx vite build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  }
  // Point the server at the in-memory database, stop it cleanly on Ctrl+C, then start the normal server.
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('banana_brigade_demo');
  console.log('Demo mode: in-memory MongoDB (data is not kept).');
  const stop = async () => { await mongo.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  require('../server/index.js');
})();
