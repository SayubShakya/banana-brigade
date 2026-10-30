// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const { EventEmitter } = require('node:events');

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

  function record(kind, user, text) {
    const event = { id: ++seq, kind, at: new Date(now()).toISOString(), user: user ?? null, text };
    recent.push(event);
    if (recent.length > size) recent.shift();
    hub.emit('event', event);
    return event;
  }

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
