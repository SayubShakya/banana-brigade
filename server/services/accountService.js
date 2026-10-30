// The player's own account tools: "where you're signed in" (list and sign out one
// device) and "download my data" (GDPR right of access).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { badRequest, notFound } = require('../lib/errors');

function createAccountService({ db, sessions, eventLog = null }) {
  // How many devices are logged in to this account, plus account dates for the profile.
  async function signedIn(userId, currentSid) {
    const user = await db.findUserById(userId);
    if (!user) throw notFound('No such user');
    const list = await sessions.list(user.id, currentSid);
    return { list, memberSince: user.created_at, lastLogin: user.last_login_at };
  }

  // Signs out one other device from the list. The current one uses log out instead.
  async function signOutDevice(user, handle, currentSid) {
    const mine = (await sessions.list(user.id, currentSid)).find((s) => s.handle === handle);
    if (!mine) throw notFound('That session has already ended');
    if (mine.current) throw badRequest('Use Log out to end the session you are using');
    await sessions.endByHandle(user.id, handle);
    eventLog?.record('security', user.username, `signed out ${mine.device} from another device`);
  }

  // Everything stored about the player as one JSON file, including the list of
  // signed-in devices. No password hash.
  async function exportData(user, currentSid) {
    const data = await db.exportUser(user.id);
    if (!data) throw notFound('No such user');
    const sessionList = await sessions.list(user.id, currentSid);
    const file = `banana-brigade-${user.username}-${new Date().toISOString().slice(0, 10)}.json`;
    return { file, body: { exportedAt: new Date().toISOString(), game: 'Banana Brigade', ...data, sessions: sessionList } };
  }

  return { signedIn, signOutDevice, exportData };
}

module.exports = { createAccountService };
