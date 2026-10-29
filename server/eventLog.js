// The server's live event feed for the admin screen. Anything worth watching
// (logins, guests, puzzles solved, scores, achievements, online kills, admin actions)
// is recorded here as a small event. A Node EventEmitter passes each one on as it
// happens (the Socket.io server forwards it to admins who are watching), and the
// last 100 are kept so a new viewer sees what just happened.
//
// This is the observer pattern on the server: the code that logs a player in does
// not know who is watching; it only says "auth:login happened".
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const { EventEmitter } = require('node:events');

// Turns the achievement engine's events into feed lines (userId -> name is looked up).
const FROM_ACHIEVEMENTS = {
  'puzzle:answered': (d) => ['puzzle', `${d.correct ? 'solved' : 'missed'} a ${d.purpose ?? 'Banana'} puzzle`],
  'score:saved': (d) => ['score', `finished ${d.mode === 'online' ? 'an online match' : `a ${d.mode} game`} with ${d.kills} kills${d.won ? ' and won' : ''}`],
  'mission:finished': (d) => ['campaign', `finished mission ${d.mission} with ${d.stars} star${d.stars === 1 ? '' : 's'}`],
  'daily:finished': (d) => ['daily', `finished the daily challenge (${d.solved}/${d.total})`],
  'power:used': (d) => ['power', `used ${d.powers.join(', ')}`],
  'achievement:unlocked': (a) => ['achievement', `unlocked "${a.name}"`],
};

function createEventLog({ size = 100, now = () => Date.now() } = {}) {
  const hub = new EventEmitter();
  const recent = [];
  let seq = 0;

  // kind groups events for the viewer's filter (auth, puzzle, score, kill, admin, ...).
  function record(kind, user, text) {
    const event = { id: ++seq, kind, at: new Date(now()).toISOString(), user: user ?? null, text };
    recent.push(event);
    if (recent.length > size) recent.shift();
    hub.emit('event', event);
    return event;
  }

  // Listens to the achievement engine, which already hears every puzzle, score and so on.
  function watchAchievements(events, db) {
    for (const [name, describe] of Object.entries(FROM_ACHIEVEMENTS)) {
      events.on(name, (userId, data) => {
        const [kind, text] = describe(data ?? {});
        db.findUserById(userId)
          .then((u) => record(kind, u?.username ?? 'someone', text))
          .catch(() => {});
      });
    }
  }

  return {
    record,
    watchAchievements,
    recent: () => [...recent],
    onEvent: (fn) => { hub.on('event', fn); return () => hub.off('event', fn); },
  };
}

module.exports = { createEventLog };
