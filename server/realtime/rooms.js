// Real-time layer: online lobby and rooms (event-driven programming theme).
// Handles the Socket.io events players send (create/join/ready/start a room, game input,
// puzzles) and keeps track of which player is in which room. Game rules run in match.js.

const crypto = require('node:crypto');
const { createMatch } = require('./match');
const { DIFFICULTY, DEFAULT_MATCH_LENGTH, matchRules } = require('../../client/src/game/config.js');
const { MAP_IDS } = require('../../client/src/game/map.js');

// Room limits and rules. Room codes use letters only, without I and O, so they are easy to read.
const MAX_PLAYERS = 6;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PUZZLE_PURPOSES = ['respawn', 'crate'];
const DIFFICULTIES = Object.keys(DIFFICULTY);

// A random 6-letter room code made with crypto (hard to guess).
const makeCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
// Socket.io acknowledgement helper: if the client sent no callback, use one that does nothing.
const ack = (cb) => (typeof cb === 'function' ? cb : () => {});

/**
 * Validates the avatar parts a player sends (only short strings for known keys).
 * @param {object} p raw parts from the client
 * @returns {object} safe parts
 */
function cleanParts(p) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  for (const k of ['hat', 'uniform', 'skin', 'goggles', 'face']) if (typeof p[k] === 'string' && p[k].length <= 24) out[k] = p[k];
  out.beard = p.beard === true;
  return out;
}

/**
 * Creates the room manager and registers all Socket.io event handlers.
 * @param {object} deps io (Socket.io server), db, pool (Banana API puzzles), puzzleStore,
 *   achievements, eventLog, matchOptions
 * @returns {object} size, room(code) and endMatch(code), mainly for tests
 */
function createRooms({ io, db, pool, puzzleStore, achievements, eventLog, matchOptions = {} }) {
  // Fires an achievement event and pushes any unlocks to that player's sockets. Never throws.
  const award = async (userId, eventName, data) => {
    try {
      for (const a of await achievements.emit(eventName, userId, data)) io.to(`user:${userId}`).emit('achievement:unlocked', a);
    } catch (err) {
      console.error('Achievement check failed:', err.message);
    }
  };

  // rooms: code -> room; roomOf: userId -> room code; issued: puzzleId -> who it was given to.
  const rooms = new Map();
  const roomOf = new Map();
  const issued = new Map();

  // The room data that is safe to send to clients.
  const view = (room) => ({
    code: room.code, host: room.host, teamMode: room.teamMode, isPublic: room.isPublic, difficulty: room.difficulty, bots: room.bots, state: room.state,
    matchLength: room.rules.timeLimit, killLimit: room.rules.killLimit, map: room.map,
    players: [...room.players.values()].map((p) => ({ userId: p.userId, username: p.username, ready: p.ready, team: p.team, connected: p.connected })),
  });
  // Broadcast helpers: 'room:update' to everyone in the room, 'rooms:changed' to everyone online.
  const update = (room) => io.to(`room:${room.code}`).emit('room:update', view(room));
  const listChanged = () => io.emit('rooms:changed');
  // Public rooms that are still in the lobby and not full.
  const publicList = () => [...rooms.values()]
    .filter((r) => r.isPublic && r.state === 'lobby' && r.players.size < MAX_PLAYERS)
    .map((r) => ({ code: r.code, host: r.players.get(r.host)?.username, players: r.players.size, teamMode: r.teamMode, difficulty: r.difficulty, bots: r.bots, matchLength: r.rules.timeLimit, killLimit: r.rules.killLimit, map: r.map, state: r.state }));

  // Puts a new player on the team with fewer players.
  function nextTeam(room) {
    const blue = [...room.players.values()].filter((p) => p.team === 'blue').length;
    return blue <= room.players.size - blue ? 'blue' : 'red';
  }

  /**
   * Removes a player from their room.
   * keepSeat: on a disconnect during a match, keep the seat so they can rejoin.
   * The room is deleted when nobody is connected; the host role passes to someone else.
   */
  function leaveRoom(userId, sockets, { keepSeat = false } = {}) {
    const code = roomOf.get(userId);
    const room = code && rooms.get(code);
    const running = !!room?.match && !room.match.over;
    if (!(keepSeat && running)) roomOf.delete(userId);
    if (!room) return;
    for (const s of sockets) s.leave(`room:${code}`);
    if (running) {
      const p = room.players.get(userId);
      if (p.connected) room.match.leave(userId);
      p.connected = false;
    } else {
      room.players.delete(userId);
    }
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (!connected.length) {
      room.match?.stop();
      rooms.delete(code);
      for (const id of room.players.keys()) if (roomOf.get(id) === code) roomOf.delete(id);
    } else if (room.host === userId) {
      room.host = connected[0].userId;
    }
    update(room);
    listChanged();
  }

  // Saves the online match replay. Errors are logged, not thrown, so the game carries on.
  async function saveMatch(summary) {
    try {
      return await db.addMatch({
        matchId: summary.matchId, mode: 'online', multiplayer: true, map: summary.map, difficulty: summary.difficulty, durationS: Math.min(3600, summary.durationS),
        teamMode: summary.teamMode, winner: summary.winner, roster: summary.roster, log: summary.log, owner: null,
      }) ?? summary.matchId;
    } catch (err) {
      console.error('Could not save the online match log:', err.message);
      return summary.matchId;
    }
  }

  // Saves every player's online score and fires 'score:saved' for achievements.
  async function saveResults(summary) {
    const matchId = await saveMatch(summary);
    for (const r of summary.results) {
      try {
        await db.addScore({
          userId: r.userId, mode: 'online', difficulty: summary.difficulty, kills: r.kills, deaths: r.deaths, wave: 0, won: r.won,
          puzzlesSolved: r.puzzlesSolved, puzzlesAttempted: r.puzzlesAttempted, durationS: Math.min(3600, summary.durationS),
          matchId, multiplayer: true, map: summary.map, draw: !summary.winner,
        });
        await award(r.userId, 'score:saved', { mode: 'online', kills: r.kills, wave: 0, won: r.won, teamMode: summary.teamMode });
      } catch (err) {
        console.error('Could not save an online score:', err.message);
      }
    }
  }

  /**
   * Starts the match for a room. The match engine (match.js) gets callbacks for its
   * events: onPower, onKill, onEnd, and send() to emit Socket.io messages to the room or one player.
   */
  function startMatch(room) {
    room.state = 'playing';
    const players = [...room.players.values()];
    room.match = createMatch({
      timeLimit: room.rules.timeLimit,
      killLimit: room.rules.killLimit,
      map: room.map,
      bots: room.bots,
      ...matchOptions,
      players,
      teamMode: room.teamMode,
      difficulty: room.difficulty,
      onPower: (userId, power) => award(userId, 'power:used', { powers: [power] }),
      onKill: (killer, victim, weapon, headshot) => eventLog?.record('kill', killer, `${killer ? 'killed' : 'took out'} ${victim} (${weapon}${headshot ? ', headshot' : ''}) in room ${room.code}`),
      send: (event, payload, userId) => io.to(userId ? `user:${userId}` : `room:${room.code}`).emit(event, payload),
      // When the match ends: save results, return to the lobby, drop players who left.
      onEnd: async (summary) => {
        await saveResults(summary);
        room.state = 'lobby';
        room.match = null;
        for (const [id, p] of room.players) {
          if (!p.connected) { room.players.delete(id); roomOf.delete(id); } else p.ready = id === room.host;
        }
        if (!room.players.size) rooms.delete(room.code);
        else update(room);
        listChanged();
      },
    });
    // Tell each player the match has started (each gets their own "me" id).
    for (const p of players) {
      io.to(`user:${p.userId}`).emit('match:start', {
        matchId: room.match.matchId, me: `u${p.userId}`, teamMode: room.teamMode, map: room.match.mapId, difficulty: room.difficulty, timeLimit: room.match.timeLimit, killLimit: room.match.killLimit, roster: room.match.roster(),
      });
    }
    update(room);
    listChanged();
  }

  // A new socket connected (it already passed the login check in socket.js).
  io.on('connection', (socket) => {
    const { userId, username } = socket.data;
    socket.join(`user:${userId}`);
    const userSockets = () => [...io.sockets.sockets.values()].filter((s) => s.data.userId === userId);

    // Reconnect: if this player was in a room, put them back (and back into the running match).
    const existing = rooms.get(roomOf.get(userId));
    if (existing) {
      socket.join(`room:${existing.code}`);
      const p = existing.players.get(userId);
      p.connected = true;
      if (existing.match?.rejoin(userId)) {
        socket.emit('match:start', { matchId: existing.match.matchId, me: `u${userId}`, teamMode: existing.teamMode, map: existing.match.mapId, difficulty: existing.difficulty, timeLimit: existing.match.timeLimit, killLimit: existing.match.killLimit, roster: existing.match.roster() });
      }
      update(existing);
    }

    /** 'rooms:list' handler: replies with the open public rooms. */
    socket.on('rooms:list', (cb) => {
      const mine = rooms.get(roomOf.get(userId));
      if (mine) socket.emit('room:update', view(mine));
      ack(cb)({ rooms: publicList() });
    });

    /**
     * 'room:create' handler: validates the options (difficulty, match length, map),
     * makes a unique code and makes this player the host. Replies with the room or an error.
     */
    socket.on('room:create', (opts, cb) => {
      const difficulty = opts?.difficulty ?? 'medium';
      if (!DIFFICULTIES.includes(difficulty)) return ack(cb)({ error: 'Unknown difficulty' });
      const rules = matchRules('online', opts?.matchLength ?? DEFAULT_MATCH_LENGTH);
      if (!rules) return ack(cb)({ error: 'Unknown match length' });
      const map = opts?.map ?? 'random';
      if (map !== 'random' && !MAP_IDS.includes(map)) return ack(cb)({ error: 'Unknown map' });
      if (roomOf.has(userId)) leaveRoom(userId, userSockets());
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      const room = {
        code, host: userId, teamMode: !!opts?.teamMode, isPublic: opts?.isPublic !== false, difficulty, bots: opts?.bots === true, map, rules: { timeLimit: rules.timeLimit, killLimit: rules.killLimit }, state: 'lobby', match: null,
        players: new Map([[userId, { userId, username, parts: cleanParts(opts?.parts), ready: true, team: 'blue', connected: true }]]),
      };
      rooms.set(code, room);
      roomOf.set(userId, code);
      for (const s of userSockets()) s.join(`room:${code}`);
      ack(cb)({ room: view(room) });
      update(room);
      listChanged();
    });

    /**
     * 'room:join' handler: joins a room by code if it exists, is not full and has not started.
     */
    socket.on('room:join', (opts, cb) => {
      const code = String(opts?.code ?? '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return ack(cb)({ error: 'No room with that code' });
      if (roomOf.get(userId) === code) return ack(cb)({ room: view(room) });
      if (room.players.size >= MAX_PLAYERS) return ack(cb)({ error: 'That room is full' });
      if (room.state !== 'lobby') return ack(cb)({ error: 'That match has already started' });
      if (roomOf.has(userId)) leaveRoom(userId, userSockets());
      room.players.set(userId, { userId, username, parts: cleanParts(opts?.parts), ready: false, team: nextTeam(room), connected: true });
      roomOf.set(userId, code);
      for (const s of userSockets()) s.join(`room:${code}`);
      ack(cb)({ room: view(room) });
      update(room);
      listChanged();
    });

    // 'room:leave' handler.
    socket.on('room:leave', () => leaveRoom(userId, userSockets()));

    // 'room:ready' handler: toggles this player's ready flag in the lobby.
    socket.on('room:ready', (opts) => {
      const room = rooms.get(roomOf.get(userId));
      if (!room || room.state !== 'lobby') return;
      room.players.get(userId).ready = !!opts?.ready;
      update(room);
    });

    /**
     * 'room:start' handler: only the host can start, everyone must be ready,
     * and at least two players are needed unless bots are on.
     */
    socket.on('room:start', (cb) => {
      const room = rooms.get(roomOf.get(userId));
      if (!room) return ack(cb)({ error: 'You are not in a room' });
      if (room.host !== userId) return ack(cb)({ error: 'Only the host can start' });
      if (room.state !== 'lobby') return ack(cb)({ error: 'The match is already running' });
      if ([...room.players.values()].some((p) => !p.ready)) return ack(cb)({ error: 'Everyone must be ready' });
      if (!room.bots && room.players.size < 2) return ack(cb)({ error: 'Invite at least one friend first (or turn on bots)' });
      startMatch(room);
      ack(cb)({ ok: true });
    });

    // 'room:end' handler: the host stops a running match early.
    socket.on('room:end', (cb) => {
      const room = rooms.get(roomOf.get(userId));
      if (!room) return ack(cb)({ error: 'You are not in a room' });
      if (room.host !== userId) return ack(cb)({ error: 'Only the host can end the match' });
      if (room.state !== 'playing' || !room.match || room.match.over) return ack(cb)({ error: 'No match is running' });
      eventLog?.record('room', room.players.get(userId)?.username, `ended the match in room ${room.code}`);
      room.match.end('host');
      ack(cb)({ ok: true });
    });

    // 'input' handler: the player's controls (move, jump, shoot). Sent many times a second;
    // the server applies them, it does not trust positions from the client.
    socket.on('input', (controls) => {
      const room = rooms.get(roomOf.get(userId));
      if (room?.match && controls && typeof controls === 'object') room.match.setControls(userId, controls);
    });

    /**
     * 'puzzle:get' handler: gives a Banana API puzzle for a respawn or crate.
     * The match must agree the player needs one (canAsk), checked again after the
     * API call because the match may have changed while waiting. The solution stays on the server.
     */
    socket.on('puzzle:get', async (opts, cb) => {
      const room = rooms.get(roomOf.get(userId));
      const purpose = opts?.purpose;
      if (!room?.match || !PUZZLE_PURPOSES.includes(purpose) || !room.match.canAsk(userId, purpose)) {
        return ack(cb)({ error: 'No puzzle needed right now' });
      }
      try {
        const { image, solution, source } = await pool.take();
        if (room.match?.canAsk(userId, purpose) !== true) return ack(cb)({ error: 'No puzzle needed right now' });
        room.match.puzzleIssued(userId, purpose);
        const puzzleId = puzzleStore.add(solution, purpose);
        issued.set(puzzleId, { userId, purpose });
        ack(cb)({ puzzleId, image, purpose, source });
      } catch {
        ack(cb)({ error: 'The Banana API is not responding. Try again in a moment.' });
      }
    });

    /**
     * 'puzzle:answer' handler: only the player the puzzle was issued to may answer it.
     * The result is applied to the match (respawn or crate reward) and achievements are checked.
     */
    socket.on('puzzle:answer', (opts, cb) => {
      const owner = issued.get(opts?.puzzleId);
      if (!owner || owner.userId !== userId || !Number.isInteger(opts?.answer)) return ack(cb)({ error: 'That puzzle is not yours or has expired' });
      issued.delete(opts.puzzleId);
      const result = puzzleStore.answer(opts.puzzleId, opts.answer);
      if (!result) return ack(cb)({ error: 'That puzzle has expired' });
      const room = rooms.get(roomOf.get(userId));
      room?.match?.countPuzzle(userId, result.correct);
      room?.match?.applyPuzzle(userId, owner.purpose, result.correct, result.grade);
      award(userId, 'puzzle:answered', result);
      ack(cb)({ correct: result.correct, solution: result.solution, purpose: owner.purpose, ms: result.ms, grade: result.grade });
    });

    // 'power:choose' handler: picks a Banana Power after a crate puzzle.
    socket.on('power:choose', (opts, cb) => {
      const room = rooms.get(roomOf.get(userId));
      const power = room?.match?.choosePower(userId, String(opts?.power ?? 'random')) ?? null;
      ack(cb)(power ? { power } : { error: 'No power to choose right now' });
    });

    // 'puzzle:cancel' handler: the player closed a crate puzzle.
    socket.on('puzzle:cancel', (opts) => {
      const room = rooms.get(roomOf.get(userId));
      if (opts?.purpose === 'crate') room?.match?.cancelCrate(userId);
    });

    // 'disconnect' handler: only leave once the user's last socket (e.g. last tab) has gone.
    socket.on('disconnect', () => {
      if (!userSockets().length) leaveRoom(userId, [], { keepSeat: true });
    });
  });

  return {
    get size() { return rooms.size; },
    room: (code) => rooms.get(code),
    endMatch: (code) => rooms.get(code)?.match?.end('host'),
  };
}

module.exports = { createRooms, MAX_PLAYERS };
