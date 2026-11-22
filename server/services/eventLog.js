// Service layer: the live activity feed (event-driven programming theme).
// Keeps the last 100 events and broadcasts each new one with a Node EventEmitter.

const { EventEmitter } = require('node:events');

// Turns game events from the achievements bus into short feed lines, e.g. "solved a crate puzzle".
const FROM_ACHIEVEMENTS = {
  'puzzle:answered': (d) => ['puzzle', `${d.correct ? 'solved' : 'missed'} a ${d.purpose ?? 'Banana'} puzzle`],
  'score:saved': (d) => ['score', `finished ${d.mode === 'online' ? 'an online match' : `a ${d.mode} game`} with ${d.kills} kills${d.won ? ' and won' : ''}`],
  'mission:finished': (d) => ['campaign', `finished mission ${d.mission} with ${d.stars} star${d.stars === 1 ? '' : 's'}`],
  'daily:finished': (d) => ['daily', `finished the daily challenge (${d.solved}/${d.total})`],
  'power:used': (d) => ['power', `used ${d.powers.join(', ')}`],
  'achievement:unlocked': (a) => ['achievement', `unlocked "${a.name}"`],
};

/**
 * Creates the event log.
 * @param {object} opts size: how many recent events to keep; now: clock (tests use a fake one)
 */
function createEventLog({ size = 100, now = () => Date.now() } = {}) {
  const hub = new EventEmitter();
  const recent = [];
  let seq = 0;

  /**
   * Adds an event to the feed and emits 'event' to every listener (e.g. the admin page socket).
   * @returns {object} the new event
   */
  function record(kind, user, text) {
    const event = { id: ++seq, kind, at: new Date(now()).toISOString(), user: user ?? null, text };
    recent.push(event);
    if (recent.length > size) recent.shift();
    hub.emit('event', event);
    return event;
  }

  /**
   * Subscribes to the game event bus: for every event name above, registers a
   * listener that looks up the player's name and records a feed line.
   */
  function watchAchievements(events, db) {
    for (const [name, describe] of Object.entries(FROM_ACHIEVEMENTS)) {
      events.on(name, (userId, data) => {
        const [kind, text] = describe(data ?? {});
        db.findUserById(userId)
          .then((u) => record(kind, u?.username ?? 'someone', text))
          // A failed lookup must never break the game, so errors are ignored.
          .catch(() => {});
      });
    }
  }

  return {
    record,
    watchAchievements,
    recent: () => [...recent],
    // onEvent returns an "unsubscribe" function, so a closed socket can stop listening.
    onEvent: (fn) => { hub.on('event', fn); return () => hub.off('event', fn); },
  };
}

module.exports = { createEventLog };
