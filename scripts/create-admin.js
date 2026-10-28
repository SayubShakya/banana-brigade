// Creates an admin account, or makes an existing player an admin.
//   npm run create-admin -- <username> <password>
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const path = require('node:path');
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../server/db');
const { USERNAME, MIN_PASSWORD } = require('../server/routes/auth');

const [username, password] = process.argv.slice(2);
if (!username || !password || !USERNAME.test(username) || password.length < MIN_PASSWORD) {
  console.error(`Usage: npm run create-admin -- <username> <password>   (password at least ${MIN_PASSWORD} characters)`);
  process.exit(1);
}

const db = openDatabase(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'brigade.db'));
const existing = db.findUserByName(username);
const hash = bcrypt.hashSync(password, 10);
if (existing) {
  db.setRole(existing.id, 'admin');
  db.setPassword(existing.id, hash);
  console.log(`${existing.username} is now an admin (password updated).`);
} else {
  db.createUser(username, hash, 'admin');
  console.log(`Admin ${username} created.`);
}
db.close();
