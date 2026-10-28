// Tuning values for Banana Brigade: physics, weapons, match rules.
// Kept in one place so the game can be balanced without touching the logic.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

export const VIEW = { width: 1280, height: 720 };
export const TILE = 40;

export const PHYSICS = {
  gravity: 1900,          // px/s²
  walkSpeed: 270,         // px/s on the ground
  airSpeed: 300,          // px/s horizontal top speed in the air
  airAccel: 1600,         // px/s² horizontal acceleration in the air
  jetThrust: 3300,        // px/s² upward while the jetpack fires
  maxRise: 480,           // px/s fastest climb
  maxFall: 950,           // px/s fastest fall
  fuelMax: 100,
  fuelBurn: 38,           // fuel per second while flying
  fuelRegen: 30,          // fuel per second on the ground
  fuelRegenDelay: 0.35,   // seconds on the ground before refuelling
};

export const SOLDIER = {
  width: 28,
  height: 50,
  maxHealth: 100,
  respawnDelay: 3,        // seconds
  spawnShield: 2,         // seconds of invulnerability after respawn
  grenades: 3,
  meleeDamage: 35,
  meleeRange: 48,
  meleeCooldown: 0.6,
};

// type: 'bullet' (tracer), 'rocket' (slow, explodes) or 'flame' (short-lived fire puffs)
export const WEAPONS = {
  magnum:  { name: 'Magnum',          type: 'bullet', damage: 24, rate: 0.34, mag: 8,   spareMags: Infinity, reload: 1.2, speed: 1600, spread: 0.025, pellets: 1, range: 950,  color: '#ffe08a' },
  smg:     { name: 'SMG',             type: 'bullet', damage: 10, rate: 0.07, mag: 32,  spareMags: 3, reload: 1.6, speed: 1600, spread: 0.09, pellets: 1, range: 800,  color: '#ffd166' },
  rifle:   { name: 'Assault Rifle',   type: 'bullet', damage: 15, rate: 0.11, mag: 30,  spareMags: 3, reload: 1.9, speed: 1900, spread: 0.04, pellets: 1, range: 1100, color: '#ffd166' },
  shotgun: { name: 'Shotgun',         type: 'bullet', damage: 12, rate: 0.8,  mag: 6,   spareMags: 3, reload: 2.0, speed: 1400, spread: 0.22, pellets: 7, range: 430,  color: '#ffb703' },
  sniper:  { name: 'Sniper',          type: 'bullet', damage: 90, rate: 1.3,  mag: 5,   spareMags: 3, reload: 2.4, speed: 2800, spread: 0.0,  pellets: 1, range: 2000, color: '#ffffff', zoom: 3 },
  rocket:  { name: 'Rocket Launcher', type: 'rocket', damage: 75, rate: 1.2,  mag: 2,   spareMags: 2, reload: 2.5, speed: 720,  spread: 0.01, pellets: 1, range: 1600, color: '#ff6b35', blastRadius: 120 },
  flamer:  { name: 'Flamethrower',    type: 'flame',  damage: 4,  rate: 0.04, mag: 100, spareMags: 1, reload: 2.2, speed: 520,  spread: 0.18, pellets: 1, range: 260,  color: '#ff7b00' },
};

export const SIDEARM = 'magnum';
// Weapons found in crates and given as a random starting primary.
export const CRATE_WEAPONS = ['smg', 'rifle', 'shotgun', 'sniper', 'rocket', 'flamer'];

export const ZOOM_LEVELS = [1, 0.8, 0.65];   // world scale: 1 = normal, smaller = see further
export const HEALTH_REGEN = { delay: 4, perSecond: 8 };

export const GRENADE = { fuse: 2.0, damage: 80, blastRadius: 140, throwSpeed: 760, bounce: 0.45 };

export const PICKUPS = {
  healthAmount: 50,
  healthRespawn: 20,      // seconds
  weaponRespawn: 15,
};

export const MATCH = {
  bots: 5,
  killLimit: 20,
  timeLimit: 300,         // seconds
};

// Each menu button starts one of these modes (after a Banana API puzzle).
export const MODES = {
  quick:    { name: 'Quick Play',  bots: 5, killLimit: 20, timeLimit: 300, respawn: 6 },
  survival: { name: 'Survival',    firstWave: 2, maxBots: 7, waveBreak: 4 },
  training: { name: 'Training',    dummies: 4, respawn: 1.5 },
  team:     { name: 'Team Battle', perTeam: 3, killLimit: 30, timeLimit: 300, respawn: 6 },
};

// Banana crates open a Banana API puzzle; solving it gives a power weapon.
export const BANANA_CRATE = { respawn: 25, weapons: ['rocket', 'sniper', 'flamer'], bonusGrenades: 2 };

export const BOT_NAMES = ['Rex', 'Viper', 'Ghost', 'Blaze', 'Tank', 'Shadow', 'Ace', 'Bolt'];

// How each kind of Banana puzzle works. Deploying is relaxed (new puzzle after a miss);
// respawns and crates happen mid-battle, so they are quicker and give one try.
export const PUZZLE_RULES = {
  deploy:  { seconds: 30, retry: true,  rule: 'Unlimited tries' },
  respawn: { seconds: 15, retry: false, rule: 'One try' },
  crate:   { seconds: 20, retry: false, rule: 'One try' },
};
