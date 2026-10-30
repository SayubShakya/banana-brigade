// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const { createMatch } = require('./match');
const { DIFFICULTY } = require('../../client/src/game/config.js');

const MAX_PLAYERS = 6;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PUZZLE_PURPOSES = ['respawn', 'crate'];
const DIFFICULTIES = Object.keys(DIFFICULTY);

const makeCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
const ack = (cb) => (typeof cb === 'function' ? cb : () => {});

function cleanParts(p) {
  if (!p || typeof p !== 'object') return {};
  const out = {};
  for (const k of ['hat', 'uniform', 'skin', 'goggles', 'face']) if (typeof p[k] === 'string' && p[k].length <= 24) out[k] = p[k];
  out.beard = p.beard === true;
  return out;
}

function createRooms({ io, db, pool, puzzleStore, achievements, eventLog, matchOptions = {} }) {
  const award = async (userId, eventName, data) => {
    try {
      for (const a of await achievements.emit(eventName, userId, data)) io.to(`user:${userId}`).emit('achievement:unlocked', a);
    } catch (err) {
      console.error('Achievement check failed:', err.message);
    }
  };

  const rooms = new Map();
  const roomOf = new Map();
  const issued = new Map();

  const view = (room) => ({
    code: room.code, host: room.host, teamMode: room.teamMode, isPublic: room.isPublic, difficulty: room.difficulty, state: room.state,
    players: [...room.players.values()].map((p) => ({ userId: p.userId, username: p.username, ready: p.ready, team: p.team, connected: p.connected })),
  });
  const update = (room) => io.to(`room:${room.code}`).emit('room:update', view(room));
  const listChanged = () => io.emit('rooms:changed');
  const publicList = () => [...rooms.values()]
    .filter((r) => r.isPublic && r.state === 'lobby' && r.players.size < MAX_PLAYERS)
    .map((r) => ({ code: r.code, host: r.players.get(r.host)?.username, players: r.players.size, teamMode: r.teamMode, difficulty: r.difficulty, state: r.state }));

  function nextTeam(room) {
    const blue = [...room.players.values()].filter((p) => p.team === 'blue').length;
    return blue <= room.players.size - blue ? 'blue' : 'red';
  }

  function leaveRoom(userId, sockets) {
    const code = roomOf.get(userId);
    const room = code && rooms.get(code);
    roomOf.delete(userId);
    if (!room) return;
    for (const s of sockets) s.leave(`room:${code}`);
    if (room.match && !room.match.over) {
      room.match.leave(userId);
      room.players.get(userId).connected = false;
    } else {
      room.players.delete(userId);
    }
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (!connected.length) {
      room.match?.stop();
      rooms.delete(code);
    } else if (room.host === userId) {
      room.host = connected[0].userId;
    }
    update(room);
    listChanged();
  }

  async function saveResults(summary) {
    for (const r of summary.results) {
      try {
        await db.addScore({
          userId: r.userId, mode: 'online', kills: r.kills, deaths: r.deaths, wave: 0, won: r.won,
          puzzlesSolved: r.puzzlesSolved, puzzlesAttempted: r.puzzlesAttempted, durationS: Math.min(3600, summary.durationS),
          matchId: summary.matchId, multiplayer: true,
        });
        await award(r.userId, 'score:saved', { mode: 'online', kills: r.kills, wave: 0, won: r.won, teamMode: summary.teamMode });
      } catch (err) {
        console.error('Could not save an online score:', err.message);
      }
    }
  }

  function startMatch(room) {
    room.state = 'playing';
    const players = [...room.players.values()];
    room.match = createMatch({
      ...matchOptions,
      players,
      teamMode: room.teamMode,
      difficulty: room.difficulty,
      onPower: (userId, power) => award(userId, 'power:used', { powers: [power] }),
      onKill: (killer, victim, weapon, headshot) => eventLog?.record('kill', killer, `${killer ? 'killed' : 'took out'} ${victim} (${weapon}${headshot ? ', headshot' : ''}) in room ${room.code}`),
      send: (event, payload, userId) => io.to(userId ? `user:${userId}` : `room:${room.code}`).emit(event, payload),
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
    for (const p of players) {
      io.to(`user:${p.userId}`).emit('match:start', {
        matchId: room.match.matchId, me: `u${p.userId}`, teamMode: room.teamMode, map: room.match.mapId, difficulty: room.difficulty, roster: room.match.roster(),
      });
    }
    update(room);
    listChanged();
  }

  io.on('connection', (socket) => {
    const { userId, username } = socket.data;
    socket.join(`user:${userId}`);
    const userSockets = () => [...io.sockets.sockets.values()].filter((s) => s.data.userId === userId);

    const existing = rooms.get(roomOf.get(userId));
    if (existing) {
      socket.join(`room:${existing.code}`);
      const p = existing.players.get(userId);
      p.connected = true;
      if (existing.match?.rejoin(userId)) {
        socket.emit('match:start', { matchId: existing.match.matchId, me: `u${userId}`, teamMode: existing.teamMode, map: existing.match.mapId, difficulty: existing.difficulty, roster: existing.match.roster() });
      }
      socket.emit('room:update', view(existing));
    }

    socket.on('rooms:list', (cb) => ack(cb)({ rooms: publicList() }));

    socket.on('room:create', (opts, cb) => {
      const difficulty = opts?.difficulty ?? 'medium';
      if (!DIFFICULTIES.includes(difficulty)) return ack(cb)({ error: 'Unknown difficulty' });
      if (roomOf.has(userId)) leaveRoom(userId, userSockets());
      let code = makeCode();
      while (rooms.has(code)) code = makeCode();
      const room = {
        code, host: userId, teamMode: !!opts?.teamMode, isPublic: opts?.isPublic !== false, difficulty, state: 'lobby', match: null,
        players: new Map([[userId, { userId, username, parts: cleanParts(opts?.parts), ready: true, team: 'blue', connected: true }]]),
      };
      rooms.set(code, room);
      roomOf.set(userId, code);
      for (const s of userSockets()) s.join(`room:${code}`);
      ack(cb)({ room: view(room) });
      update(room);
      listChanged();
    });

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

    socket.on('room:leave', () => leaveRoom(userId, userSockets()));

    socket.on('room:ready', (opts) => {
      const room = rooms.get(roomOf.get(userId));
      if (!room || room.state !== 'lobby') return;
      room.players.get(userId).ready = !!opts?.ready;
      update(room);
    });

    socket.on('room:start', (cb) => {
      const room = rooms.get(roomOf.get(userId));
      if (!room) return ack(cb)({ error: 'You are not in a room' });
      if (room.host !== userId) return ack(cb)({ error: 'Only the host can start' });
      if (room.state !== 'lobby') return ack(cb)({ error: 'The match is already running' });
      if ([...room.players.values()].some((p) => !p.ready)) return ack(cb)({ error: 'Everyone must be ready' });
      startMatch(room);
      ack(cb)({ ok: true });
    });

    socket.on('input', (controls) => {
      const room = rooms.get(roomOf.get(userId));
      if (room?.match && controls && typeof controls === 'object') room.match.setControls(userId, controls);
    });

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

    socket.on('puzzle:answer', (opts, cb) => {
      const owner = issued.get(opts?.puzzleId);
      if (!owner || owner.userId !== userId || !Number.isInteger(opts?.answer)) return ack(cb)({ error: 'That puzzle is not yours or has expired' });
      issued.delete(opts.puzzleId);
      const result = puzzleStore.answer(opts.puzzleId, opts.answer);
      if (!result) return ack(cb)({ error: 'That puzzle has expired' });
      const room = rooms.get(roomOf.get(userId));
      room?.match?.countPuzzle(userId, result.correct);
      room?.match?.applyPuzzle(userId, owner.purpose, result.correct);
      award(userId, 'puzzle:answered', result);
      ack(cb)({ correct: result.correct, solution: result.solution, purpose: owner.purpose });
    });

    socket.on('power:choose', (opts, cb) => {
      const room = rooms.get(roomOf.get(userId));
      const power = room?.match?.choosePower(userId, String(opts?.power ?? 'random')) ?? null;
      ack(cb)(power ? { power } : { error: 'No power to choose right now' });
    });

    socket.on('puzzle:cancel', (opts) => {
      const room = rooms.get(roomOf.get(userId));
      if (opts?.purpose === 'crate') room?.match?.cancelCrate(userId);
    });

    socket.on('disconnect', () => {
      if (!userSockets().length) leaveRoom(userId, []);
    });
  });

  return {
    get size() { return rooms.size; },
    room: (code) => rooms.get(code),
    endMatch: (code) => rooms.get(code)?.match?.end('host'),
  };
}

module.exports = { createRooms, MAX_PLAYERS };
