// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const crypto = require('node:crypto');
const { createWorld, updateWorld, revive, rewardBananaCrate, closeBananaCrate, endMatchNow, emptyControls, powerChoices, bananaAnswered, callSupplyDrop, openSupplyCrate } = require('../../client/src/game/world.js');
const { BANANA_CRATE, BANANA_METER, SOLDIER } = require('../../client/src/game/config.js');
const { crateChoiceCount } = require('../../client/src/game/meter.js');
const { updateBots } = require('../../client/src/game/bots.js');
const { BOT_NAMES } = require('../../client/src/game/config.js');
const { randomMapId, MAP_IDS } = require('../../client/src/game/map.js');

const TICK_HZ = 30;
const SNAPSHOT_EVERY = 1;
const ACTIONS = ['reload', 'swap', 'grenade', 'melee', 'pickup', 'supply'];
const round = (n) => Math.round(n * 10) / 10;

const CRATE_TIMINGS = {
  holdMs: 1600,
  extraMs: 6000,
  cooldownMs: 5000,
  botGrace: 1,
};
const gun = (g) => g && { key: g.key, ammo: g.ammo, spare: g.spare === Infinity ? -1 : g.spare };

function soldierState(s) {
  return {
    id: s.id, x: round(s.x), y: round(s.y), aim: round(s.aim), facing: s.facing, walkPhase: round(s.walkPhase),
    onGround: s.onGround, jetting: s.jetting, alive: s.alive, health: Math.ceil(s.health), fuel: Math.round(s.fuel),
    hurtFlash: round(s.hurtFlash), shieldTimer: round(s.shieldTimer), armor: Math.round(s.armor), fuelBoost: round(s.fuelBoost), power: s.power ? { id: s.power.id, timer: round(s.power.timer) } : null, fireCooldown: round(s.fireCooldown), reloadTimer: round(s.reloadTimer),
    respawnTimer: s.alive ? 0 : round(Math.min(99, s.respawnTimer)), grenades: s.grenades, kills: s.kills, deaths: s.deaths, streak: s.streak,
    current: s.current, primary: gun(s.primary), sidearm: gun(s.sidearm), lastAttacker: s.lastAttacker?.id ?? null, busy: !!s.busy,
    bananaUsed: !!s.bananaUsed, meter: Math.round(s.meter ?? 0),
  };
}

function createMatch({ players, teamMode, difficulty = 'medium', send, onEnd, onPower, onKill, timeLimit, killLimit, crateTimings, map = 'random', bots = true }) {
  const T = { ...CRATE_TIMINGS, ...crateTimings };
  const matchId = crypto.randomUUID();
  const outbox = [];
  const near = new Set();
  const crates = new Map();
  const holds = new Map();
  const cooldowns = new Map();
  const offers = new Map();
  const puzzles = new Map();
  const pending = new Map();
  const startedAt = Date.now();
  let tick = 0;
  let ended = false;

  const sid = (userId) => `u${userId}`;
  const emit = (event, p) => {
    switch (event) {
      case 'soldier:killed':
        outbox.push(['killed', { victim: p.victim.id, killer: p.killer?.id ?? null, weapon: p.weapon, headshot: !!p.headshot }]);
        if (p.victim.id.startsWith('u') || p.killer?.id.startsWith('u')) onKill?.(p.killer?.name ?? null, p.victim.name, p.weapon, !!p.headshot);
        break;
      case 'soldier:damaged': outbox.push(['damaged', { victim: p.victim.id, attacker: p.attacker?.id ?? null, amount: round(p.amount), headshot: !!p.headshot }]); break;
      case 'soldier:respawned': outbox.push(['respawned', { soldier: p.soldier.id }]); break;
      case 'power:start': case 'power:warning': case 'power:end':
        outbox.push(['fx', { name: event, soldier: p.soldier.id, power: p.power, seconds: p.seconds, random: p.random }]);
        break;
      case 'pickup:taken': outbox.push(['pickup', { soldier: p.soldier.id, kind: p.kind, weapon: p.weapon }]); break;
      case 'weapon:fired': outbox.push(['fired', { soldier: p.soldier.id, weapon: p.weapon, x: round(p.x), y: round(p.y) }]); break;
      case 'weapon:reloading': case 'weapon:reloaded': case 'weapon:empty':
        outbox.push([event.slice(7), { soldier: p.soldier.id, weapon: p.weapon }]); break;
      case 'explosion': outbox.push(['explosion', { x: round(p.x), y: round(p.y), radius: p.radius }]); break;
      case 'soldier:landed': case 'bullet:wall': case 'grenade:thrown': case 'grenade:bounce':
      case 'melee:swing': case 'jetpack:sputter': case 'shield:broken':
        outbox.push(['fx', { name: event, soldier: p.soldier?.id ?? null, x: p.x == null ? undefined : round(p.x), y: p.y == null ? undefined : round(p.y), speed: p.speed }]);
        break;
      case 'pickup:available': if (p.banana) near.add(p.soldier.id); break;
      case 'banana:crate': if (p.pickup.supply) offerSupply(p.soldier, p.pickup); else offerCrate(p.soldier, p.pickup); break;
      case 'banana:meter': outbox.push(['fx', { name: event, soldier: p.soldier.id, gained: p.gained, grade: p.grade, full: p.full, streak: p.streak }]); break;
      case 'banana:drop': outbox.push(['fx', { name: event, soldier: p.soldier.id, x: round(p.x), y: round(p.y) }]); break;
      case 'match:ended': finish(p); break;
      default: break;
    }
  };

  const mapId = MAP_IDS.includes(map) ? map : randomMapId();
  const world = createWorld({
    mode: 'online', teamMode, difficulty, emit, map: mapId, timeLimit, killLimit, fillBots: bots,
    humans: players.map((p) => ({ id: sid(p.userId), name: p.username, avatar: { parts: p.parts }, team: p.team })),
    botAvatars: Array.from({ length: 8 }, (_, i) => ({ bot: i })),
    botNames: [...BOT_NAMES].sort(() => Math.random() - 0.5),
  });
  const byUser = (userId) => world.soldiers.find((s) => s.id === sid(userId));

  const roster = () => world.soldiers.map((s) => ({ id: s.id, name: s.name, team: s.team, human: s.isPlayer, avatar: s.avatar }));

  function offerCrate(soldier, pickup) {
    if (soldier.busy || !pickup.active || ended) return;
    const userId = soldier.id.slice(1);
    if (Date.now() < (cooldowns.get(userId) ?? 0)) return;
    for (const c of crates.values()) if (c.pickup === pickup) return;
    soldier.busy = true;
    soldier.shieldTimer = 999;
    const seconds = world.difficulty.puzzle.crate;
    const timer = setTimeout(() => expireCrate(userId), seconds * 1000 + T.extraMs);
    crates.set(userId, { pickup, timer });
    send('puzzle:offer', { purpose: 'crate', seconds }, userId);
  }

  function offerSupply(soldier, pickup) {
    if (soldier.busy || !pickup.active || ended) return;
    const userId = soldier.id.slice(1);
    openSupplyCrate(pickup);
    soldier.busy = true;
    soldier.shieldTimer = 999;
    const timer = setTimeout(() => api.choosePower(userId, 'random'), (BANANA_CRATE.pickSeconds + 1) * 1000);
    offers.set(userId, { choices: powerChoices(BANANA_METER.supplyChoices), timer });
    send('power:offer', { choices: offers.get(userId).choices, seconds: BANANA_CRATE.pickSeconds }, userId);
  }

  function expireCrate(userId) {
    if (!crates.delete(userId)) return;
    release(userId);
    send('puzzle:closed', { purpose: 'crate', reason: 'time' }, userId);
  }

  function release(userId) {
    cooldowns.set(userId, Date.now() + T.cooldownMs);
    const s = byUser(userId);
    if (!s) return;
    s.busy = false;
    s.shieldTimer = SOLDIER.spawnShield;
    s.graceUntil = world.time + SOLDIER.spawnShield + T.botGrace;
  }

  function clearTimers(userId) {
    clearTimeout(crates.get(userId)?.timer);
    clearTimeout(holds.get(userId));
    clearTimeout(offers.get(userId)?.timer);
    crates.delete(userId);
    holds.delete(userId);
    offers.delete(userId);
  }
  const clearAllTimers = () => { for (const id of new Set([...crates.keys(), ...holds.keys(), ...offers.keys()])) clearTimers(id); };

  function setControls(userId, c) {
    const prev = pending.get(userId) ?? emptyControls();
    const next = {
      left: !!c.left, right: !!c.right, jet: !!c.jet, fire: !!c.fire,
      aimX: Number.isFinite(c.aimX) ? c.aimX : prev.aimX, aimY: Number.isFinite(c.aimY) ? c.aimY : prev.aimY,
    };
    for (const a of ACTIONS) next[a] = prev[a] || !!c[a];
    pending.set(userId, next);
  }

  function step() {
    tick += 1;
    for (const [userId, c] of pending) {
      const s = byUser(userId);
      if (!s || !s.isPlayer) continue;
      if (s.busy) Object.assign(s.controls, emptyControls(), { aimX: c.aimX, aimY: c.aimY });
      else Object.assign(s.controls, c);
      if (c.supply && !s.busy) callSupplyDrop(world, s);
      for (const a of ACTIONS) c[a] = false;
    }
    near.clear();
    updateBots(world, 1 / TICK_HZ);
    updateWorld(world, 1 / TICK_HZ);
    if (tick % SNAPSHOT_EVERY === 0) sendSnapshot();
  }

  function sendSnapshot() {
    send('match:snapshot', {
      t: Date.now(), time: round(world.time), timeLeft: round(world.timeLeft), teamKills: world.teamKills,
      soldiers: world.soldiers.map(soldierState),
      bullets: world.bullets.map((b) => ({ x: round(b.x), y: round(b.y), px: round(b.px ?? b.x), py: round(b.py ?? b.y), color: b.color })),
      rockets: world.rockets.map((r) => ({ x: round(r.x), y: round(r.y), vx: round(r.vx), vy: round(r.vy) })),
      flames: world.flames.map((f) => ({ x: round(f.x), y: round(f.y), age: round(f.age), life: f.life })),
      grenades: world.grenades.map((g) => ({ x: round(g.x), y: round(g.y), w: g.w, h: g.h, fuse: round(g.fuse) })),
      pickups: world.pickups.map((p) => ({ kind: p.kind, x: p.x, y: p.y, active: p.active, weapon: p.weapon, dropped: p.dropped, timer: p.active ? 0 : round(p.timer ?? 0) })),
      near: [...near],
      events: outbox.splice(0),
    });
  }

  const timer = setInterval(() => {
    try { step(); } catch (err) { console.error('Match tick failed:', err); }
  }, 1000 / TICK_HZ);

  function finish({ ranking, teamKills, reason }) {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    clearAllTimers();
    const winners = teamMode
      ? (teamKills.blue === teamKills.red ? null : teamKills.blue > teamKills.red ? 'blue' : 'red')
      : ranking[0]?.id;
    const humans = ranking.filter((s) => s.id.startsWith('u') && players.some((p) => sid(p.userId) === s.id));
    const results = humans.map((s) => {
      const userId = s.id.slice(1);
      const p = puzzles.get(userId) ?? { solved: 0, attempted: 0 };
      return {
        userId, kills: s.kills, deaths: s.deaths, won: teamMode ? s.team === winners : s.id === winners,
        puzzlesSolved: p.solved, puzzlesAttempted: p.attempted,
      };
    });
    const summary = {
      matchId, reason, teamMode, teamKills: { ...teamKills }, durationS: Math.round((Date.now() - startedAt) / 1000),
      ranking: ranking.map((s) => ({ id: s.id, name: s.name, team: s.team, kills: s.kills, deaths: s.deaths, human: s.id.startsWith('u') })),
    };
    setImmediate(() => {
      sendSnapshot();
      send('match:end', summary);
      onEnd({ ...summary, results });
    });
  }

  const api = {
    matchId,
    mapId,
    roster,
    botLevel: world.difficulty.name,
    timeLimit: world.cfg.timeLimit,
    killLimit: world.cfg.killLimit,
    setControls,
    countPuzzle(userId, correct) {
      const p = puzzles.get(userId) ?? { solved: 0, attempted: 0 };
      p.attempted += 1;
      if (correct) p.solved += 1;
      puzzles.set(userId, p);
    },
    canAsk(userId, purpose) {
      const s = byUser(userId);
      if (!s || ended) return false;
      if (purpose === 'respawn') return !s.alive && !s.bananaUsed;
      if (purpose === 'crate') return crates.has(userId);
      return false;
    },
    puzzleIssued(userId, purpose) {
      const s = byUser(userId);
      if (s && purpose === 'respawn') s.bananaUsed = true;
    },
    applyPuzzle(userId, purpose, correct, grade = null) {
      const s = byUser(userId);
      if (!s || ended) return;
      bananaAnswered(world, s, { correct, grade });
      if (purpose === 'respawn' && correct) revive(world, s, grade);
      if (purpose === 'crate') {
        const crate = crates.get(userId);
        if (!crate) return;
        clearTimeout(crate.timer);
        crates.delete(userId);
        const offer = correct && crate.pickup.active;
        if (crate.pickup.active) closeBananaCrate(crate.pickup);
        if (!offer) {
          holds.set(userId, setTimeout(() => { holds.delete(userId); release(userId); }, T.holdMs));
          return;
        }
        const choices = powerChoices(crateChoiceCount(grade));
        const timer = setTimeout(() => api.choosePower(userId, 'random'), (BANANA_CRATE.pickSeconds + 1) * 1000);
        offers.set(userId, { choices, timer });
        send('power:offer', { choices, seconds: BANANA_CRATE.pickSeconds }, userId);
      }
    },
    choosePower(userId, choice) {
      const offer = offers.get(userId);
      const s = byUser(userId);
      if (!offer || !s) return null;
      clearTimeout(offer.timer);
      offers.delete(userId);
      release(userId);
      if (ended) return null;
      const power = rewardBananaCrate(world, s, offer.choices.includes(choice) ? choice : 'random');
      onPower?.(userId, power);
      return power;
    },
    cancelCrate(userId) {
      if (!crates.has(userId) && !offers.has(userId)) return;
      clearTimers(userId);
      release(userId);
    },
    leave(userId) {
      const s = byUser(userId);
      if (!s) return;
      const solving = crates.has(userId) || holds.has(userId) || offers.has(userId);
      clearTimers(userId);
      if (solving) release(userId);
      s.isPlayer = false;
      s.name = `${s.name} (bot)`;
      pending.delete(userId);
      outbox.push(['left', { soldier: s.id }]);
    },
    rejoin(userId) {
      const s = byUser(userId);
      if (!s || ended) return false;
      s.isPlayer = true;
      s.name = s.name.replace(/ \(bot\)$/, '');
      return true;
    },
    end(reason = 'host') { endMatchNow(world, reason); },
    stop() { ended = true; clearInterval(timer); clearAllTimers(); },
    get over() { return ended; },
    get world() { return world; },
  };
  return api;
}

module.exports = { createMatch, TICK_HZ };
