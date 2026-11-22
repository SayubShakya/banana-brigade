// The game world: the core simulation shared by the browser and the Node server.
// It holds soldiers, bullets, pickups and the map, runs physics and combat every tick,
// and announces what happens with world.emit(...) events (soldier:killed, pickup:taken, match:ended...).
import { emit as busEmit } from '../services/eventBus.js';
import { PHYSICS, SOLDIER, WEAPONS, CRATE_WEAPONS, SIDEARM, GRENADE, PICKUPS, TILE, HEALTH_REGEN, MODES, BANANA_CRATE, DIFFICULTY, HEADSHOT_ZONE, HEAD_CAP_ABOVE, HEAD_CAP_HALF_WIDTH, POWERS, BANANA_METER } from './config.js';
import { createMap, moveBox, raycast, isSolid, MAPS, randomMapId } from './map.js';
import { RAMP } from './campaign.js';
import { applyAnswer, spawnShieldFor } from './meter.js';

const POWERUP_KINDS = new Set(PICKUPS.powerups);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// The controls object every soldier has. Input (player) or bots (computer) set it; the world reads it.
export function emptyControls() {
  return {
    left: false, right: false, jet: false, fire: false, aimX: 0, aimY: 0,
    reload: false, swap: false, grenade: false, melee: false, pickup: false,
  };
}

/**
 * Creates a soldier with full health and fuel. Not alive until spawn() places it on the map.
 * @param {string} id unique id ('p0' player, 'b1' bot, 'u12' online user, 'd0' dummy)
 * @param {string} team team name; by default the soldier's own id, so in free-for-all everyone is an enemy
 */
function createSoldier(id, name, avatar, isPlayer, team = id) {
  return {
    id, name, avatar, isPlayer, team, isDummy: false,
    x: 0, y: 0, w: SOLDIER.width, h: SOLDIER.height, vx: 0, vy: 0,
    facing: 1, aim: 0, walkPhase: 0, onGround: false, jetting: false,
    health: SOLDIER.maxHealth, fuel: PHYSICS.fuelMax, groundTime: 0,
    jetHeld: false, jetBuffer: 0, coyote: 0, sputterCooldown: 0,
    armor: 0, armorTimer: 0, fuelBoost: 0,
    alive: false, respawnTimer: 0, shieldTimer: 0, hurtFlash: 0,
    sidearm: newGun(SIDEARM), primary: null, current: 'primary', lastHurt: 0,
    fireCooldown: 0, reloadTimer: 0, meleeCooldown: 0, grenades: SOLDIER.grenades,
    kills: 0, deaths: 0, streak: 0, lastAttacker: null,
    meter: 0, bananaStreak: 0, drops: 0,
    controls: emptyControls(),
  };
}

// The gun in hand: the primary gun if selected and owned, otherwise the sidearm.
export const activeGun = (s) => (s.current === 'primary' && s.primary ? s.primary : s.sidearm);
export const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
// Where shots come from: the middle of the body at shoulder height (25 px from the top).
const shoulder = (s) => ({ x: s.x + s.w / 2, y: s.y + 25 });

// A fresh gun with a full magazine and its spare ammo.
function newGun(key) {
  const w = WEAPONS[key];
  return { key, ammo: w.mag, spare: w.spareMags === Infinity ? Infinity : w.mag * w.spareMags };
}

/**
 * Hit detection: does the line segment (x0,y0)-(x1,y1) cross the box b?
 * Uses the Liang-Barsky clipping method: clip the line against each side of the box.
 * @returns {number|null} t from 0 to 1 = how far along the segment it first touches the box, or null for a miss
 */
function segmentHitsBox(x0, y0, x1, y1, b) {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (clip(-dx, x0 - b.x) && clip(dx, b.x + b.w - x0) && clip(-dy, y0 - b.y) && clip(dy, b.y + b.h - y0)) return t0;
  return null;
}

/**
 * Checks a bullet's path against a soldier's body box and a small "head cap" box above it.
 * The head cap makes shots that just clip the top of the head still count.
 * @returns {number|null} the earliest hit position t along the path, or null
 */
function bulletHitsSoldier(x0, y0, x1, y1, s) {
  const body = segmentHitsBox(x0, y0, x1, y1, s);
  const cap = { x: s.x + s.w / 2 - HEAD_CAP_HALF_WIDTH, y: s.y - HEAD_CAP_ABOVE, w: HEAD_CAP_HALF_WIDTH * 2, h: HEAD_CAP_ABOVE };
  const head = segmentHitsBox(x0, y0, x1, y1, cap);
  if (body === null) return head;
  if (head === null) return body;
  return Math.min(body, head);
}

/**
 * Creates a new match world for any mode (quick, team, survival, training, campaign, online).
 * Adds the player, bots or dummies, places pickups and spawns everyone.
 * Emits: 'match:started' (and 'survival:wave' in survival mode).
 * @param {object} options mode, player name/avatar, bot looks, emit function, online humans,
 *   difficulty, mission, map id, time and kill limits
 * @returns {object} the world state object used by updateWorld() and the renderer
 */
export function createWorld({ mode = 'quick', playerName, playerAvatar, botAvatars, botNames, emit = busEmit, humans = null, teamMode = false, difficulty = 'medium', mission = null, map: mapId = null, timeLimit = null, killLimit = null, fillBots = true }) {
  // Match rules: campaign takes them from the mission, other modes from MODES plus the chosen limits.
  const cfg = mode === 'campaign'
    ? { name: mission.name, bots: mission.bots, killLimit: mission.target, timeLimit: mission.timeLimit, respawn: 5, lives: mission.lives }
    : { ...MODES[mode], ...(timeLimit > 0 && { timeLimit }), ...(killLimit > 0 && { killLimit }) };
  const map = createMap(MAPS[mapId] ? mapId : mission?.map ?? randomMapId());
  const online = mode === 'online';
  const player = online ? null : createSoldier('p0', playerName, playerAvatar, true, mode === 'team' ? 'blue' : 'p0');
  // Online: every human is a soldier (no local player). Offline: the local player is soldier 'p0'.
  const soldiers = online ? humans.map((h) => createSoldier(h.id, h.name, h.avatar, true, teamMode ? h.team : h.id)) : [player];
  const world = {
    emit, map, soldiers, mode, cfg, player, teamMode: mode === 'team' || (online && teamMode),
    difficulty: DIFFICULTY[difficulty] ?? DIFFICULTY.medium,
    mission, rampBonus: 0, nextRamp: RAMP.every, continues: 0,
    training: mode === 'training',
    looks: { avatars: botAvatars, names: botNames, next: 0 },
    bullets: [], rockets: [], flames: [], grenades: [], particles: [],
    pickups: [],
    time: 0,
    timeLeft: cfg.timeLimit ?? Infinity,
    countdown: null,
    wave: 0, waveBreak: 0,
    teamKills: { blue: 0, red: 0 },
    over: false,
  };

  if (mode === 'quick' || mode === 'campaign') for (let i = 0; i < cfg.bots; i++) addBot(world);
  if (mode === 'campaign') player.lives = cfg.lives;
  // Online rooms can be topped up with bots, keeping the two teams balanced.
  if (online && fillBots) {
    for (let i = soldiers.length; i < cfg.size; i++) {
      const blue = soldiers.filter((s) => s.team === 'blue').length;
      const red = soldiers.filter((s) => s.team === 'red').length;
      addBot(world, teamMode ? (blue <= red ? 'blue' : 'red') : undefined);
    }
  }
  if (mode === 'team') {
    for (let i = 0; i < cfg.perTeam - 1; i++) addBot(world, 'blue');
    for (let i = 0; i < cfg.perTeam; i++) addBot(world, 'red');
  }
  if (mode === 'training') {
    for (let i = 0; i < cfg.dummies; i++) {
      const d = createSoldier(`d${i}`, 'Dummy', botAvatars[i % botAvatars.length], false);
      d.isDummy = true;
      soldiers.push(d);
    }
  }

  // Place the health packs, weapon crates and banana crates from the map's spots.
  map.healthSpots.forEach((p) => world.pickups.push({ kind: 'health', x: p.x, y: p.y + 6, active: true, timer: 0 }));
  map.crateSpots.forEach((p) => world.pickups.push({ kind: 'weapon', weapon: pick(CRATE_WEAPONS), x: p.x, y: p.y + 6, active: true, timer: 0, crateSpot: true }));
  map.bananaSpots.forEach((p) => world.pickups.push({ kind: 'banana', x: p.x, y: p.y + 6, active: true, timer: 0 }));

  soldiers.forEach((s) => spawn(world, s, true));
  if (mode === 'survival') startWave(world);
  world.emit('match:started', { soldiers, mode });
  return world;
}

// Adds a bot with the next name and avatar from the list.
function addBot(world, team) {
  const { looks } = world;
  const i = looks.next++;
  const id = `b${i}`;
  const bot = createSoldier(id, looks.names[i % looks.names.length], looks.avatars[i % looks.avatars.length], false, team ?? id);
  world.soldiers.push(bot);
  return bot;
}

// Survival: starts the next wave with one more enemy each time (up to maxBots). Emits 'survival:wave'.
function startWave(world) {
  world.wave += 1;
  const count = Math.min(world.cfg.maxBots, world.cfg.firstWave + world.wave - 1);
  for (let i = 0; i < count; i++) spawn(world, addBot(world, 'enemy'));
  world.emit('survival:wave', { wave: world.wave, count });
}

const enemiesOf = (world, s) => world.soldiers.filter((o) => o !== s && o.alive && o.team !== s.team);

/**
 * Spawns (or respawns) a soldier at the safest spawn point: the one furthest from enemies,
 * plus a little randomness. Training dummies do the opposite and spawn close.
 * Resets health, fuel and guns and gives a short spawn shield.
 * Emits 'soldier:respawned' (not for the first spawn of the match).
 */
function spawn(world, s, initial = false) {
  const enemies = enemiesOf(world, s);
  let best = world.map.spawns[0];
  let bestScore = -Infinity;
  for (const p of world.map.spawns) {
    const d = enemies.length ? Math.min(...enemies.map((e) => Math.hypot(center(e).x - p.x, center(e).y - p.y))) : rand(0, 1000);
    const score = (s.isDummy ? -d : d) + rand(0, 250);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  Object.assign(s, {
    x: best.x - s.w / 2, y: best.y + TILE / 2 - s.h - 1, vx: 0, vy: 0,
    health: SOLDIER.maxHealth, fuel: PHYSICS.fuelMax, alive: true,
    shieldTimer: SOLDIER.spawnShield, hurtFlash: 0, reloadTimer: 0, fireCooldown: 0, armor: 0, armorTimer: 0, fuelBoost: 0, power: null,
    bananaUsed: false,
    sidearm: newGun(SIDEARM), primary: newGun(pick(CRATE_WEAPONS)), current: 'primary', grenades: SOLDIER.grenades,
  });
  if (!initial) world.emit('soldier:respawned', { soldier: s });
}

/**
 * Applies damage to a soldier and handles the kill.
 * Order: shield/bubble checks -> friendly fire off -> rage power and difficulty scaling
 * -> armour absorbs first -> health. On death: score, weapon drop, blood particles, end checks.
 * Emits: 'shield:broken', 'soldier:damaged', 'power:end', 'player:out', 'soldier:killed', 'player:down'.
 * @param {object} info { headshot } from the bullet hit test
 */
export function damage(world, victim, amount, attacker, weaponName, info = {}) {
  if (!victim.alive || victim.shieldTimer > 0 || world.over) return;
  if (attacker && attacker !== victim && attacker.team === victim.team) return;
  if (hasPower(victim, 'bubble')) return;
  if (attacker && attacker !== victim && hasPower(attacker, 'rage')) amount *= POWERS.rage.damage;
  // Bots hit the player for less on easier difficulty.
  if (attacker && !attacker.isPlayer && victim.isPlayer) amount *= world.difficulty.damage;
  if (victim.armor > 0) {
    const soak = Math.min(victim.armor, amount);
    victim.armor -= soak;
    amount -= soak;
    if (victim.armor <= 0) { victim.armor = 0; victim.armorTimer = 0; world.emit('shield:broken', { soldier: victim }); }
  }
  victim.health -= amount;
  victim.hurtFlash = 0.12;
  victim.lastHurt = world.time;
  victim.lastAttacker = attacker;
  const headshot = !!info.headshot;
  world.emit('soldier:damaged', { victim, attacker, amount, headshot });
  if (victim.health > 0) return;

  victim.health = 0;
  victim.alive = false;
  if (victim.power) { world.emit('power:end', { soldier: victim, power: victim.power.id }); victim.power = null; }
  victim.deaths += 1;
  victim.streak = 0;
  victim.respawnTimer = victim.isDummy ? world.cfg.respawn : world.cfg.respawn ?? SOLDIER.respawnDelay;
  // Campaign: each death costs a life; out of lives waits for a "continue".
  if (world.mode === 'campaign' && victim.isPlayer) {
    victim.lives -= 1;
    if (victim.lives <= 0) { victim.respawnTimer = Infinity; world.emit('player:out', { continues: world.continues }); }
  }
  // Survival: the player can only come back with a Banana puzzle; dead enemies are removed.
  if (world.mode === 'survival') {
    if (victim.isPlayer) victim.respawnTimer = Infinity;
    else victim.gone = true;
  }
  if (attacker && attacker !== victim) {
    attacker.kills += 1;
    attacker.streak += 1;
    if (world.teamKills[attacker.team] !== undefined) world.teamKills[attacker.team] += 1;
  }
  // The victim drops their primary gun so others can pick it up (it disappears after 12 s).
  if (victim.primary && victim.primary.ammo + victim.primary.spare > 0) {
    world.pickups.push({ kind: 'weapon', weapon: victim.primary.key, x: victim.x + victim.w / 2, y: victim.y + victim.h - 14, active: true, timer: 0, dropped: 12 });
  }
  for (let i = 0; i < 18; i++) {
    world.particles.push({ x: victim.x + victim.w / 2, y: victim.y + 20, vx: rand(-260, 260), vy: rand(-420, -60), life: rand(0.4, 0.9), color: '#b3001b', size: rand(2, 4), gravity: true });
  }
  world.emit('soldier:killed', { victim, killer: attacker, weapon: weaponName, headshot });

  if (victim.isPlayer && world.mode === 'survival') world.emit('player:down', { wave: world.wave });

  const killer = attacker && attacker !== victim ? attacker : null;
  // Check the win conditions after every kill.
  const freeForAll = world.mode === 'quick' || (world.mode === 'online' && !world.teamMode);
  if (freeForAll && killer && killer.kills >= world.cfg.killLimit) endMatch(world, 'kill limit');
  if (world.mode === 'campaign' && killer?.isPlayer && killer.kills >= world.cfg.killLimit) endMatch(world, 'target');
  if (world.teamMode && Math.max(world.teamKills.blue, world.teamKills.red) >= world.cfg.killLimit) endMatch(world, 'kill limit');
}

// Brings a dead soldier back right away (after a solved Banana puzzle). A gold answer adds a longer shield.
export function revive(world, s, grade = null) {
  if (s.alive || world.over) return;
  spawn(world, s);
  const shield = spawnShieldFor(grade);
  if (shield) s.shieldTimer = shield;
}

/**
 * Updates a soldier's Banana Meter after a Banana API puzzle answer.
 * Emits 'banana:meter' so the HUD can show the gain.
 * @returns {object} the new meter state from applyAnswer()
 */
export function bananaAnswered(world, s, { correct, grade = null }) {
  const next = applyAnswer({ value: s.meter, streak: s.bananaStreak }, { correct, grade });
  s.meter = next.value;
  s.bananaStreak = next.streak;
  world.emit('banana:meter', { soldier: s, value: s.meter, streak: s.bananaStreak, gained: next.gained, grade, full: next.full });
  return next;
}

export function fillBananaMeter(world, s) {
  s.meter = BANANA_METER.max;
  world.emit('banana:meter', { soldier: s, value: s.meter, streak: s.bananaStreak, gained: 0, grade: 'gold', full: true });
}

export const meterFull = (s) => s.meter >= BANANA_METER.max;

// Finds the top of the ground below a point (so a supply crate lands on the floor).
function groundBelow(map, x, feet) {
  for (let y = feet; y < feet + TILE * 30; y += TILE / 2) {
    if (isSolid(map, x, y)) return Math.floor(y / TILE) * TILE;
  }
  return feet;
}

/**
 * X key with a full Banana Meter: drops a free banana crate next to the player (or under them
 * if the side is blocked) and empties the meter.
 * Emits 'banana:drop' and 'banana:meter'.
 * @returns {object|null} the crate pickup, or null if not allowed
 */
export function callSupplyDrop(world, s) {
  if (!s.alive || world.over || !meterFull(s)) return null;
  const c = center(s);
  const feet = s.y + s.h;
  const ground = groundBelow(world.map, c.x, feet);
  const offset = c.x + s.facing * BANANA_METER.dropOffset;
  const side = isSolid(world.map, offset, c.y) || groundBelow(world.map, offset, feet) !== ground ? 0 : s.facing * BANANA_METER.dropOffset;
  const crate = { kind: 'banana', supply: true, x: c.x + side, y: ground - 14, active: true, timer: 0, dropped: BANANA_METER.dropLife };
  world.pickups.push(crate);
  s.meter = 0;
  s.drops += 1;
  world.emit('banana:drop', { soldier: s, x: crate.x, y: crate.y, pickup: crate });
  world.emit('banana:meter', { soldier: s, value: 0, streak: s.bananaStreak, gained: 0, grade: null, full: false });
  return crate;
}

export function openSupplyCrate(pickup) {
  pickup.active = false;
  pickup.gone = true;
}

// Campaign "continue": one more life after running out (counted, it lowers the stars).
export function continueMission(world) {
  const p = world.player;
  if (world.over || p.lives > 0) return;
  world.continues += 1;
  p.lives = 1;
  spawn(world, p);
}

export const hasPower = (s, id) => s.power?.id === id;
const POWER_IDS = Object.keys(POWERS);

// Picks n random different Banana Powers to offer after a crate puzzle.
export function powerChoices(n = BANANA_CRATE.choices) {
  return [...POWER_IDS].sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.min(POWER_IDS.length, n)));
}

/**
 * Gives a Banana Power to a soldier. 'random' (or an unknown choice) gives a random power
 * with a few bonus seconds. Emits 'power:start' and 'pickup:taken'.
 * @returns {string} the power id
 */
export function rewardBananaCrate(world, s, choice = 'random') {
  const random = !POWERS[choice];
  const id = random ? pick(POWER_IDS) : choice;
  const seconds = POWERS[id].seconds + (random ? BANANA_CRATE.randomBonus : 0);
  s.power = { id, timer: seconds, total: seconds, warned: false };
  if (id === 'heal') s.health = SOLDIER.maxHealth;
  if (id === 'rapid') { const gun = activeGun(s); gun.ammo = Math.max(gun.ammo, 1); s.reloadTimer = 0; }
  world.emit('power:start', { soldier: s, power: id, seconds, random });
  world.emit('pickup:taken', { soldier: s, kind: 'banana', power: id });
  return id;
}

// Counts down the active power, applies its per-tick effect, and emits 'power:warning' (2 s left) and 'power:end'.
function updatePower(world, s, dt) {
  const p = s.power;
  if (!p) return;
  p.timer -= dt;
  if (p.id === 'heal') s.health = Math.min(SOLDIER.maxHealth, s.health + POWERS.heal.regen * dt);
  if (p.id === 'overdrive') s.fuel = PHYSICS.fuelMax;
  if (!p.warned && p.timer <= 2) { p.warned = true; world.emit('power:warning', { soldier: s, power: p.id }); }
  if (p.timer <= 0) { s.power = null; world.emit('power:end', { soldier: s, power: p.id }); }
}

// Closes a banana crate after use; it comes back after BANANA_CRATE.respawn seconds.
export function closeBananaCrate(pickup) {
  pickup.active = false;
  pickup.timer = BANANA_CRATE.respawn;
}

export function endMatchNow(world, reason) { endMatch(world, reason); }

// Ends the match once (guarded by world.over), ranks soldiers and emits 'match:ended' with the result.
function endMatch(world, reason) {
  if (world.over) return;
  world.over = true;
  world.endedAt = world.time;
  const ranking = [...world.soldiers].filter((s) => !s.isDummy).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  world.emit('match:ended', { reason, ranking, player: world.player, mode: world.mode, wave: world.wave, teamKills: { ...world.teamKills }, mission: world.mission, continues: world.continues });
}

/**
 * Rocket / grenade explosion. Damage and knockback get smaller with distance (falloff)
 * and walls block the blast. Emits 'explosion'.
 */
function explode(world, x, y, radius, dmg, owner, weaponName, selfDamage = 1) {
  world.emit('explosion', { x, y, radius });
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(80, 420);
    world.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.7), color: pick(['#ffbe0b', '#fb5607', '#ff006e', '#ffd166']), size: rand(3, 7), gravity: false });
  }
  for (const s of world.soldiers) {
    if (!s.alive) continue;
    const c = center(s);
    const d = Math.hypot(c.x - x, c.y - y);
    if (d > radius) continue;
    const wall = raycast(world.map, x, y, c.x, c.y, 6);
    // A wall between the blast and the soldier protects them (unless the wall is right at the blast point).
    if (wall && Math.hypot(wall.x - x, wall.y - y) > 14) continue;
    const falloff = 1 - d / radius;
    const still = hasPower(s, 'bubble') || s.busy;
    const push = still ? 0 : 600 * falloff;
    s.vx += ((c.x - x) / (d || 1)) * push;
    s.vy += ((c.y - y) / (d || 1)) * push - (still ? 0 : 150 * falloff);
    const scale = s === owner ? selfDamage : 1;
    damage(world, s, Math.round(dmg * (0.35 + 0.65 * falloff) * scale), owner, weaponName);
  }
}

/**
 * Fires the active gun once: creates bullets, rockets or flames along the aim angle with random spread.
 * Shotguns create several pellets. Emits 'weapon:fired' and starts a reload when the magazine is empty.
 */
function fire(world, s) {
  const gun = activeGun(s);
  const w = WEAPONS[gun.key];
  const sh = shoulder(s);
  const muzzle = { x: sh.x + Math.cos(s.aim) * 36, y: sh.y + Math.sin(s.aim) * 36 };
  // If the gun barrel is inside a wall, start the shot from the shoulder so you cannot shoot through walls.
  const start = raycast(world.map, sh.x, sh.y, muzzle.x, muzzle.y) ? sh : muzzle;

  for (let i = 0; i < w.pellets; i++) {
    const a = s.aim + rand(-w.spread, w.spread);
    const proj = { owner: s, x: start.x, y: start.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, damage: w.damage, travelled: 0, range: w.range, color: w.color, weapon: w.name, falloff: w.falloff, headshot: w.headshot };
    if (w.type === 'rocket') world.rockets.push({ ...proj, blastRadius: w.blastRadius, selfDamage: w.selfDamage ?? 1, smoke: 0 });
    else if (w.type === 'flame') world.flames.push({ ...proj, vx: proj.vx + s.vx * 0.5, vy: proj.vy + s.vy * 0.5, life: w.range / w.speed, age: 0, drag: w.drag ?? 1.5, hit: new Set() });
    else world.bullets.push(proj);
  }
  if (!hasPower(s, 'rapid')) gun.ammo -= 1;
  s.fireCooldown = w.rate * (hasPower(s, 'rapid') ? POWERS.rapid.fireRate : 1);
  world.emit('weapon:fired', { soldier: s, weapon: gun.key, x: start.x, y: start.y });
  if (gun.ammo <= 0 && gun.spare > 0) startReload(world, s);
}

// Starts a reload if one is needed and possible. Emits 'weapon:reloading'.
function startReload(world, s) {
  const gun = activeGun(s);
  const w = WEAPONS[gun.key];
  if (s.reloadTimer > 0 || gun.ammo >= w.mag || gun.spare <= 0) return;
  s.reloadTimer = w.reload;
  world.emit('weapon:reloading', { soldier: s, weapon: gun.key, seconds: w.reload });
}

// Moves ammo from spare into the magazine. Emits 'weapon:reloaded'.
function finishReload(world, s) {
  const gun = activeGun(s);
  const w = WEAPONS[gun.key];
  const need = w.mag - gun.ammo;
  const take = Math.min(need, gun.spare);
  gun.ammo += take;
  if (gun.spare !== Infinity) gun.spare -= take;
  world.emit('weapon:reloaded', { soldier: s, weapon: gun.key });
}

// Throws a grenade along the aim, adding some of the soldier's own speed. Emits 'grenade:thrown'.
function throwGrenade(world, s) {
  if (s.grenades <= 0) return;
  s.grenades -= 1;
  const sh = shoulder(s);
  world.grenades.push({
    owner: s, x: sh.x, y: sh.y, w: 8, h: 8,
    vx: Math.cos(s.aim) * GRENADE.throwSpeed + s.vx * 0.4,
    vy: Math.sin(s.aim) * GRENADE.throwSpeed + s.vy * 0.4 - 120,
    fuse: GRENADE.fuse,
  });
  world.emit('grenade:thrown', { soldier: s });
}

// Melee hit on the first enemy just in front (in the facing direction). Emits 'melee:swing'.
function melee(world, s) {
  s.meleeCooldown = SOLDIER.meleeCooldown;
  const c = center(s);
  world.emit('melee:swing', { soldier: s });
  for (const o of world.soldiers) {
    if (o === s || !o.alive || o.team === s.team) continue;
    const oc = center(o);
    const ahead = (oc.x - c.x) * s.facing;
    if (ahead > -6 && ahead < SOLDIER.meleeRange + 14 && Math.abs(oc.y - c.y) < 40) {
      o.vx += s.facing * 300;
      damage(world, o, SOLDIER.meleeDamage, s, 'Melee');
      return;
    }
  }
}

/**
 * Applies a pickup to a soldier (health, shield, fuel, ammo or a new weapon).
 * Taking a new weapon drops the old one. Emits 'pickup:taken'.
 * @returns {boolean} false if the pickup was not needed (for example full health)
 */
function takePickup(world, s, p) {
  if (p.kind === 'health') {
    if (s.health >= SOLDIER.maxHealth) return false;
    s.health = Math.min(SOLDIER.maxHealth, s.health + PICKUPS.healthAmount);
  } else if (p.kind === 'shield') {
    if (s.armor >= PICKUPS.shieldAmount) return false;
    s.armor = PICKUPS.shieldAmount;
    s.armorTimer = PICKUPS.shieldTime;
  } else if (p.kind === 'fuel') {
    s.fuel = PHYSICS.fuelMax;
    s.fuelBoost = PICKUPS.fuelBoostTime;
  } else if (p.kind === 'ammo') {
    const gun = s.primary;
    const w = gun && WEAPONS[gun.key];
    if (!gun || gun.spare >= w.mag * w.spareMags) return false;
    gun.spare = w.mag * w.spareMags;
  } else {
    if (s.primary) world.pickups.push({ kind: 'weapon', weapon: s.primary.key, x: p.x + s.facing * -10, y: p.y, active: true, timer: 0, dropped: 12 });
    s.primary = newGun(p.weapon);
    s.current = 'primary';
    s.reloadTimer = 0;
  }
  world.emit('pickup:taken', { soldier: s, kind: p.kind, weapon: p.weapon, crate: !!p.crateSpot });
  if (p.dropped) p.gone = true;
  else { p.active = false; p.timer = p.kind === 'health' ? PICKUPS.healthRespawn : PICKUPS.weaponRespawn; }
  return true;
}

// The jetpack is out of fuel: emit 'jetpack:sputter' (sound and smoke), at most every 0.5 s.
function sputter(world, s) {
  s.sputterCooldown = PHYSICS.sputterCooldown;
  world.emit('jetpack:sputter', { soldier: s, x: s.x + s.w / 2, y: s.y + s.h - 10 });
}

/**
 * Updates one soldier for one tick: respawn timer, timers and regen, aim and facing,
 * walking and air control, jetpack, gravity, collision, weapons and pickups.
 * Reads the soldier's controls (set by input.js for the player or bots.js for bots).
 */
function updateSoldier(world, s, dt) {
  if (!s.alive) {
    if (s.gone) return;
    s.respawnTimer -= dt;
    if (s.respawnTimer <= 0 && !world.over) spawn(world, s);
    return;
  }
  const c = s.controls;
  if (s.isDummy) { c.aimX = s.x + s.w / 2 - 100; c.aimY = s.y + 25; }
  s.shieldTimer = Math.max(0, s.shieldTimer - dt);
  s.hurtFlash = Math.max(0, s.hurtFlash - dt);
  if (s.armorTimer > 0) { s.armorTimer -= dt; if (s.armorTimer <= 0) { s.armorTimer = 0; s.armor = 0; } }
  s.fireCooldown = Math.max(0, s.fireCooldown - dt);
  s.meleeCooldown = Math.max(0, s.meleeCooldown - dt);
  updatePower(world, s, dt);
  const speed = hasPower(s, 'overdrive') ? POWERS.overdrive.speed : 1;
  if (s.health < SOLDIER.maxHealth && world.time - s.lastHurt > HEALTH_REGEN.delay) {
    s.health = Math.min(SOLDIER.maxHealth, s.health + HEALTH_REGEN.perSecond * dt);
  }

  const sh = shoulder(s);
  // Aim angle from the shoulder to the aim point; the soldier faces the side it aims at.
  s.aim = Math.atan2(c.aimY - sh.y, c.aimX - sh.x);
  s.facing = Math.cos(s.aim) >= 0 ? 1 : -1;

  const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
  // On the ground: ease quickly towards walking speed. In the air: accelerate, with extra grip when turning back.
  if (s.onGround) {
    const target = dir * PHYSICS.walkSpeed * speed;
    s.vx += (target - s.vx) * Math.min(1, dt * 18);
  } else {
    const turning = dir !== 0 && Math.sign(s.vx) === -dir;
    s.vx += dir * PHYSICS.airAccel * speed * (turning ? PHYSICS.airTurnBoost : 1) * dt;
    if (!dir) s.vx *= 1 - Math.min(1, dt * PHYSICS.airDrag);
    s.vx = Math.max(-PHYSICS.airSpeed * 1.6 * speed, Math.min(PHYSICS.airSpeed * 1.6 * speed, s.vx));
    if (Math.abs(s.vx) > PHYSICS.airSpeed * speed && dir === Math.sign(s.vx)) s.vx -= Math.sign(s.vx) * PHYSICS.airAccel * dt;
  }

  // Jetpack take-off: jump buffer and coyote time make a press a little early or late still work.
  const jetPressed = c.jet && !s.jetHeld;
  s.jetHeld = c.jet;
  s.jetBuffer = jetPressed ? PHYSICS.jumpBuffer : Math.max(0, s.jetBuffer - dt);
  s.coyote = s.onGround ? PHYSICS.coyoteTime : Math.max(0, s.coyote - dt);
  s.sputterCooldown = Math.max(0, s.sputterCooldown - dt);
  if (s.fuelBoost > 0) { s.fuelBoost = Math.max(0, s.fuelBoost - dt); s.fuel = PHYSICS.fuelMax; }
  if (c.jet && s.jetBuffer > 0 && s.coyote > 0 && s.fuel > PHYSICS.takeoffFuel && s.vy > -PHYSICS.takeoffKick) {
    s.vy = -PHYSICS.takeoffKick;
    if (!(s.fuelBoost > 0)) s.fuel -= PHYSICS.takeoffFuel;
    s.jetBuffer = 0;
    s.coyote = 0;
  }
  s.jetting = c.jet && s.fuel > 0;
  // Jet thrust is strong when falling and eases off near the max rise speed, for smooth flying.
  if (s.jetting) {
    const rise = Math.max(0, -s.vy) / PHYSICS.maxRise;
    const curve = s.vy > 0 ? PHYSICS.jetLiftBoost : 1 - PHYSICS.jetEase * rise * rise;
    s.vy -= PHYSICS.jetThrust * curve * dt;
    if (s.vy < -PHYSICS.maxRise) s.vy = -PHYSICS.maxRise;
    if (!(s.fuelBoost > 0)) s.fuel = Math.max(0, s.fuel - PHYSICS.fuelBurn * dt);
    if (s.fuel <= 0 && s.sputterCooldown <= 0) sputter(world, s);
  } else if (jetPressed && s.sputterCooldown <= 0) {
    sputter(world, s);
  }
  // Gravity, capped at the maximum fall speed.
  s.vy = Math.min(PHYSICS.maxFall, s.vy + PHYSICS.gravity * dt);

  const fallSpeed = s.vy;
  const wasOnGround = s.onGround;
  // Move with collision; touching the floor sets onGround. A hard landing emits 'soldier:landed'.
  const hit = moveBox(world.map, s, dt);
  s.onGround = hit.bottom;
  if (s.onGround && !wasOnGround && fallSpeed >= PHYSICS.landMinSpeed) {
    world.emit('soldier:landed', { soldier: s, speed: Math.round(fallSpeed), x: s.x + s.w / 2, y: s.y + s.h });
  }
  if (s.onGround) {
    s.groundTime += dt;
    if (s.groundTime > PHYSICS.fuelRegenDelay) s.fuel = Math.min(PHYSICS.fuelMax, s.fuel + PHYSICS.fuelRegen * dt);
    if (dir) s.walkPhase += dt * 14;
  } else {
    s.groundTime = 0;
  }

  // Weapons: swap, reload, fire. With no ammo left: reload, else switch to the sidearm, else 'weapon:empty'.
  if (c.swap) {
    if (s.primary) {
      if (s.reloadTimer > 0) world.emit('weapon:reload-cancelled', { soldier: s, weapon: activeGun(s).key });
      s.current = s.current === 'primary' ? 'sidearm' : 'primary';
      s.reloadTimer = 0;
      world.emit('weapon:switched', { soldier: s, weapon: activeGun(s).key });
    }
  }
  if (s.reloadTimer > 0) {
    s.reloadTimer -= dt;
    if (s.reloadTimer <= 0) { s.reloadTimer = 0; finishReload(world, s); }
  } else {
    const gun = activeGun(s);
    if (c.reload) startReload(world, s);
    else if (c.fire && s.fireCooldown <= 0) {
      if (gun.ammo > 0) fire(world, s);
      else if (gun.spare > 0) startReload(world, s);
      else if (s.current === 'primary') { s.current = 'sidearm'; world.emit('weapon:switched', { soldier: s, weapon: SIDEARM }); }
      else world.emit('weapon:empty', { soldier: s });
    }
  }
  if (c.grenade) throwGrenade(world, s);
  if (c.melee && s.meleeCooldown <= 0) melee(world, s);

  // Pickups the soldier is touching. Health and power-ups are automatic; weapons need E (bots take them
  // when low on ammo). Banana crates emit 'banana:crate' on E, which opens a Banana API puzzle.
  // While standing on one, the player gets 'pickup:available' every tick so the HUD shows a prompt.
  for (let i = 0, n = world.pickups.length; i < n; i++) {
    const p = world.pickups[i];
    if (!p.active || p.gone) continue;
    if (Math.abs(p.x - (s.x + s.w / 2)) > 26 || Math.abs(p.y - (s.y + s.h / 2)) > 36) continue;
    if (p.kind === 'banana') {
      if (s.isPlayer && c.pickup) world.emit('banana:crate', { pickup: p, soldier: s, supply: !!p.supply });
      else if (s.isPlayer) world.emit('pickup:available', { banana: true, supply: !!p.supply, soldier: s });
      continue;
    }
    if (p.kind === 'health' || POWERUP_KINDS.has(p.kind)) takePickup(world, s, p);
    else if (c.pickup || (!s.isPlayer && (!s.primary || s.primary.ammo + s.primary.spare < 4))) {
      if (takePickup(world, s, p)) c.pickup = false;
    }
    else if (s.isPlayer) world.emit('pickup:available', { weapon: p.weapon, soldier: s });
  }

  // One-shot actions are used up after this tick.
  c.reload = c.swap = c.grenade = c.melee = c.pickup = false;
}

/**
 * Damage for a bullet hit. Shotgun pellets lose damage over distance (falloff).
 * Headshot: the hit point is in the top part of the body (HEADSHOT_ZONE), then damage is multiplied.
 * @param {number} hitY world y of the hit point
 * @param {number} dist distance travelled by the bullet
 * @returns {{amount:number, headshot:boolean}}
 */
export function bulletDamage(b, victim, hitY, dist) {
  let amount = b.damage;
  if (b.falloff && dist > b.falloff.start) {
    const t = Math.min(1, (dist - b.falloff.start) / Math.max(1, b.range - b.falloff.start));
    amount *= 1 - t * (1 - b.falloff.min);
  }
  const headshot = !!b.headshot && hitY - victim.y < victim.h * HEADSHOT_ZONE;
  if (headshot) amount *= b.headshot;
  return { amount: Math.round(amount * 10) / 10, headshot };
}

/**
 * Moves bullets, rockets, flames, grenades and particles for one tick and handles their hits.
 * Each list is filtered: returning false removes the item.
 */
function updateProjectiles(world, dt) {
  const { map } = world;

  world.bullets = world.bullets.filter((b) => {
    const nx = b.x + b.vx * dt;
    const ny = b.y + b.vy * dt;
    // Bullets: check the whole path this tick (not just the end point) so fast bullets cannot skip through walls or soldiers.
    const wall = raycast(map, b.x, b.y, nx, ny, 5);
    const endX = wall ? wall.x : nx;
    const endY = wall ? wall.y : ny;
    let victim = null;
    let best = Infinity;
    for (const s of world.soldiers) {
      if (s === b.owner || !s.alive) continue;
      const t = bulletHitsSoldier(b.x, b.y, endX, endY, s);
      // Keep the soldier hit first along the path.
      if (t !== null && t < best) { best = t; victim = s; }
    }
    b.px = b.x; b.py = b.y;
    if (victim) {
      const hitY = b.y + (endY - b.y) * best;
      const dist = b.travelled + Math.hypot(endX - b.x, endY - b.y) * best;
      const { amount, headshot } = bulletDamage(b, victim, hitY, dist);
      damage(world, victim, amount, b.owner, b.weapon, { headshot });
      for (let i = 0; i < 5; i++) world.particles.push({ x: b.x + (endX - b.x) * best, y: b.y + (endY - b.y) * best, vx: rand(-120, 120), vy: rand(-160, 40), life: 0.3, color: '#c1121f', size: 2.5, gravity: true });
      return false;
    }
    b.travelled += Math.hypot(endX - b.x, endY - b.y);
    b.x = endX; b.y = endY;
    if (wall) {
      // Hit a wall: emit 'bullet:wall' for the spark sound and effect.
      world.emit('bullet:wall', { x: endX, y: endY });
      for (let i = 0; i < 4; i++) world.particles.push({ x: endX, y: endY, vx: rand(-90, 90), vy: rand(-140, 0), life: 0.25, color: '#ffe8a3', size: 2, gravity: true });
      return false;
    }
    return b.travelled < b.range;
  });

  // Rockets explode on a wall, on a soldier, or at max range.
  world.rockets = world.rockets.filter((r) => {
    const nx = r.x + r.vx * dt;
    const ny = r.y + r.vy * dt;
    const wall = raycast(map, r.x, r.y, nx, ny, 5);
    let boom = wall;
    if (!boom) {
      for (const s of world.soldiers) {
        if (s === r.owner || !s.alive) continue;
        if (segmentHitsBox(r.x, r.y, nx, ny, s) !== null) { boom = { x: nx, y: ny }; break; }
      }
    }
    r.smoke += dt;
    if (r.smoke > 0.02) { r.smoke = 0; world.particles.push({ x: r.x, y: r.y, vx: rand(-20, 20), vy: rand(-30, 0), life: 0.6, color: 'rgba(200,200,200,0.6)', size: 5, gravity: false }); }
    r.travelled += Math.hypot(nx - r.x, ny - r.y);
    if (boom || r.travelled > r.range) {
      explode(world, boom ? boom.x : nx, boom ? boom.y : ny, r.blastRadius, r.damage, r.owner, 'Rocket', r.selfDamage);
      return false;
    }
    r.x = nx; r.y = ny;
    return true;
  });

  // Flames grow as they age and slow down; each flame can hurt each soldier only once.
  world.flames = world.flames.filter((f) => {
    f.age += dt;
    const nx = f.x + f.vx * dt;
    const ny = f.y + f.vy * dt - 60 * dt;
    if (raycast(map, f.x, f.y, nx, ny, 6)) return false;
    f.x = nx; f.y = ny;
    f.vx *= 1 - dt * f.drag; f.vy *= 1 - dt * f.drag;
    const r = 8 + f.age * 40;
    for (const s of world.soldiers) {
      if (s === f.owner || !s.alive || f.hit.has(s)) continue;
      if (f.x + r > s.x && f.x - r < s.x + s.w && f.y + r > s.y && f.y - r < s.y + s.h) {
        f.hit.add(s);
        damage(world, s, f.damage, f.owner, f.weapon);
      }
    }
    return f.age < f.life;
  });

  // Grenades fall with gravity and bounce off walls (losing speed), then explode when the fuse runs out.
  world.grenades = world.grenades.filter((g) => {
    g.vy = Math.min(PHYSICS.maxFall, g.vy + PHYSICS.gravity * dt);
    const vx = g.vx, vy = g.vy;
    const box = { x: g.x - 4, y: g.y - 4, w: g.w, h: g.h, vx, vy };
    const hit = moveBox(map, box, dt);
    g.x = box.x + 4; g.y = box.y + 4;
    g.vx = hit.left || hit.right ? -vx * GRENADE.bounce : box.vx;
    g.vy = hit.top || hit.bottom ? -vy * GRENADE.bounce : box.vy;
    if (hit.bottom) g.vx *= 0.8;
    if ((hit.bottom || hit.top || hit.left || hit.right) && Math.hypot(vx, vy) > 150) world.emit('grenade:bounce', {});
    g.fuse -= dt;
    if (g.fuse <= 0) { explode(world, g.x, g.y, GRENADE.blastRadius, GRENADE.damage, g.owner, 'Grenade'); return false; }
    return true;
  });

  world.particles = world.particles.filter((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += PHYSICS.gravity * 0.6 * dt;
    return p.life > 0 && !isSolid(map, p.x, p.y);
  });
}

// Respawn timers for pickups. A weapon crate spot may come back as a power-up instead. Dropped items expire.
function updatePickups(world, dt) {
  for (const p of world.pickups) {
    if (p.dropped) { p.dropped -= dt; if (p.dropped <= 0) p.gone = true; continue; }
    if (p.active) continue;
    p.timer -= dt;
    if (p.timer <= 0) {
      p.active = true;
      if (p.crateSpot) {
        p.kind = Math.random() < PICKUPS.powerupChance ? pick(PICKUPS.powerups) : 'weapon';
        p.weapon = p.kind === 'weapon' ? pick(CRATE_WEAPONS) : undefined;
      }
    }
  }
  world.pickups = world.pickups.filter((p) => !p.gone);
}

/**
 * Advances the whole world by one fixed time step (dt seconds). Called by the game loop
 * (GameSession in the browser, the room loop on the server).
 * Emits: 'match:countdown' (last 10 s), 'match:ended' (time up), 'campaign:ramp', 'survival:cleared'.
 */
export function updateWorld(world, dt) {
  world.time += dt;
  if (!world.over && !world.training) {
    world.timeLeft -= dt;
    const seconds = Math.ceil(world.timeLeft);
    // Emit the countdown only once per second (world.countdown remembers the last second sent).
    if (seconds <= 10 && seconds > 0 && seconds !== world.countdown) { world.countdown = seconds; world.emit('match:countdown', { seconds }); }
    if (world.timeLeft <= 0) { world.timeLeft = 0; endMatch(world, 'time'); }
  }
  for (const s of world.soldiers) updateSoldier(world, s, dt);
  updateProjectiles(world, dt);
  updatePickups(world, dt);

  // Campaign ramp: every 60 s bots get a bit more accurate and faster to react.
  if (world.mode === 'campaign' && !world.over && world.time >= world.nextRamp) {
    world.nextRamp += RAMP.every;
    world.rampBonus += RAMP.accuracy;
    world.difficulty = { ...world.difficulty, reaction: world.difficulty.reaction * RAMP.reaction };
    world.emit('campaign:ramp', { level: Math.round(world.rampBonus / RAMP.accuracy) });
  }

  // Survival: when all enemies are dead, wait a short break, then start the next wave.
  if (world.mode === 'survival' && !world.over) {
    world.soldiers = world.soldiers.filter((s) => !s.gone);
    const left = world.soldiers.filter((s) => s.team === 'enemy').length;
    if (left === 0) {
      if (world.waveBreak <= 0) { world.waveBreak = world.cfg.waveBreak; world.emit('survival:cleared', { wave: world.wave }); }
      world.waveBreak -= dt;
      if (world.waveBreak <= 0) startWave(world);
    }
  }
}
