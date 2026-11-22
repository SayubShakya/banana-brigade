// Creates an admin account, or turns an existing player into an admin and sets a new password.
// Usage: npm run create-admin -- <username> <password>
const bcrypt = require('bcryptjs');
const { openDatabase } = require('../server/repositories');
const { USERNAME, MIN_PASSWORD } = require('../server/services/authService');

// Read the username and password from the command line and check them with the same rules as sign-up.
const [username, password] = process.argv.slice(2);
if (!username || !password || !USERNAME.test(username) || password.length < MIN_PASSWORD) {
  console.error(`Usage: npm run create-admin -- <username> <password>   (password at least ${MIN_PASSWORD} characters)`);
  process.exit(1);
}

(async () => {
  const db = await openDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/banana_brigade');
  const existing = await db.findUserByName(username);
  // Only a bcrypt hash (cost factor 10) is stored, never the plain password.
  const hash = bcrypt.hashSync(password, 10);
  if (existing) {
    await db.setRole(existing.id, 'admin');
    await db.setPassword(existing.id, hash);
    console.log(`${existing.username} is now an admin (password updated).`);
  } else {
    await db.createUser(username, hash, 'admin');
    console.log(`Admin ${username} created.`);
  }
  await db.close();
})();
