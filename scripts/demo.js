// Starts Banana Brigade with a throw-away in-memory MongoDB, so the game can be shown
// on any computer with Node.js, even without MongoDB installed (e.g. at the tutor
// demo). Accounts and scores are lost when it stops.
//   npm run demo
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  // Use a locally installed mongod if there is one (Apple silicon or Intel Homebrew,
  // or Linux), and ask for its own version so there is no "version conflict" warning.
  // Without one, mongodb-memory-server uses the copy it downloaded during npm install.
  const local = ['/opt/homebrew/bin/mongod', '/usr/local/bin/mongod', '/usr/bin/mongod'].find((p) => fs.existsSync(p));
  if (!process.env.MONGOMS_SYSTEM_BINARY && local) {
    process.env.MONGOMS_SYSTEM_BINARY = local;
    const version = /db version v(\d+\.\d+\.\d+)/.exec(execSync(`${local} --version`).toString())?.[1];
    if (version && !process.env.MONGOMS_VERSION) process.env.MONGOMS_VERSION = version;
  }
  if (!fs.existsSync(path.join(__dirname, '..', 'client', 'dist', 'index.html'))) {
    console.log('Building the React app…');
    execSync('npx vite build', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  }
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('banana_brigade_demo');
  console.log('Demo mode: in-memory MongoDB (data is not kept).');
  const stop = async () => { await mongo.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  require('../server/index.js');
})();
