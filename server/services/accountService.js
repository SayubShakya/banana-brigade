// Service layer: the player's account page (signed-in devices, sign out other
// devices, download my data). Virtual identity theme.

const { badRequest, notFound } = require('../lib/errors');

/**
 * Creates the account service.
 * @param {object} deps db (repositories), sessions (session store helper), eventLog (optional)
 */
function createAccountService({ db, sessions, eventLog = null }) {
  /**
   * Lists this user's active sessions (devices) and account dates.
   * @throws 404 if the user no longer exists
   */
  async function signedIn(userId, currentSid) {
    const user = await db.findUserById(userId);
    if (!user) throw notFound('No such user');
    const list = await sessions.list(user.id, currentSid);
    return { list, memberSince: user.created_at, lastLogin: user.last_login_at };
  }

  /**
   * Ends one of the user's other sessions (e.g. a lost phone).
   * Only sessions in the user's own list can be found, so nobody can end someone else's session.
   * @throws 404 if the session is gone; 400 if it is the current one (use Log out instead)
   */
  async function signOutDevice(user, handle, currentSid) {
    const mine = (await sessions.list(user.id, currentSid)).find((s) => s.handle === handle);
    if (!mine) throw notFound('That session has already ended');
    if (mine.current) throw badRequest('Use Log out to end the session you are using');
    await sessions.endByHandle(user.id, handle);
    eventLog?.record('security', user.username, `signed out ${mine.device} from another device`);
  }

  /**
   * Builds the "download my data" JSON file.
   * @returns {Promise<{file: string, body: object}>} file name and contents
   */
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
