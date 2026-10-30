// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

export const VIEW = { width: 1280, height: 720 };
export const TILE = 40;

export const PHYSICS = {
  gravity: 1900,
  walkSpeed: 270,
  airSpeed: 300,
  airAccel: 1500,
  airTurnBoost: 1.7,
  airDrag: 2.2,
  jetThrust: 3300,
  jetLiftBoost: 1.5,
  jetEase: 0.35,
  takeoffKick: 230,
  takeoffFuel: 3,
  coyoteTime: 0.12,
  jumpBuffer: 0.15,
  landMinSpeed: 260,
  sputterCooldown: 0.5,
  maxRise: 480,
  maxFall: 950,
  fuelMax: 100,
  fuelBurn: 38,
  fuelRegen: 30,
  fuelRegenDelay: 0.35,
};

export const SOLDIER = {
  width: 28,
  height: 50,
  maxHealth: 100,
  respawnDelay: 3,
  spawnShield: 2,
  grenades: 3,
  meleeDamage: 25,
  meleeRange: 48,
  meleeCooldown: 0.8,
};

export const WEAPONS = {
  magnum:  { name: 'Magnum',          type: 'bullet', damage: 25, rate: 0.34, mag: 8,   spareMags: Infinity, reload: 1.2, speed: 1600, spread: 0.025, pellets: 1, range: 950,  color: '#ffe08a', headshot: 1.5 },
  smg:     { name: 'SMG',             type: 'bullet', damage: 10, rate: 0.07, mag: 32,  spareMags: 3, reload: 1.6, speed: 1600, spread: 0.09, pellets: 1, range: 800,  color: '#ffd166', headshot: 1.3 },
  rifle:   { name: 'Assault Rifle',   type: 'bullet', damage: 15, rate: 0.11, mag: 30,  spareMags: 3, reload: 1.9, speed: 1900, spread: 0.04, pellets: 1, range: 1100, color: '#ffd166', headshot: 1.5 },
  shotgun: { name: 'Shotgun',         type: 'bullet', damage: 12, rate: 0.8,  mag: 6,   spareMags: 3, reload: 2.0, speed: 1400, spread: 0.22, pellets: 7, range: 430,  color: '#ffb703', falloff: { start: 120, min: 0.3 }, headshot: 1.25 },
  sniper:  { name: 'Sniper',          type: 'bullet', damage: 70, rate: 1.3,  mag: 5,   spareMags: 3, reload: 2.4, speed: 2800, spread: 0.0,  pellets: 1, range: 2000, color: '#ffffff', zoom: 3, headshot: 2.0 },
  rocket:  { name: 'Rocket Launcher', type: 'rocket', damage: 75, rate: 1.2,  mag: 2,   spareMags: 2, reload: 2.5, speed: 720,  spread: 0.01, pellets: 1, range: 1600, color: '#ff6b35', blastRadius: 120, selfDamage: 0.4 },
  flamer:  { name: 'Flamethrower',    type: 'flame',  damage: 4,  rate: 0.04, mag: 100, spareMags: 1, reload: 2.2, speed: 620,  spread: 0.15, pellets: 1, range: 320,  color: '#ff7b00', drag: 1.0 },
};

export const HEADSHOT_ZONE = 0.45;
export const HEAD_CAP_ABOVE = 6;
export const HEAD_CAP_HALF_WIDTH = 9;

export const SIDEARM = 'magnum';
export const CRATE_WEAPONS = ['smg', 'rifle', 'shotgun', 'sniper', 'rocket', 'flamer'];

export const ZOOM_LEVELS = [1, 0.8, 0.65];
export const HEALTH_REGEN = { delay: 4, perSecond: 8 };

export const GRENADE = { fuse: 2.0, damage: 80, blastRadius: 140, throwSpeed: 760, bounce: 0.45 };

export const PICKUPS = {
  healthAmount: 50,
  healthRespawn: 20,
  weaponRespawn: 15,
  powerupChance: 0.3,
  powerups: ['shield', 'fuel', 'ammo'],
  shieldAmount: 50,
  shieldTime: 10,
  fuelBoostTime: 6,
};

export const MATCH = {
  bots: 5,
  killLimit: 20,
  timeLimit: 300,
};

export const MODES = {
  quick:    { name: 'Quick Play',  bots: 5, killLimit: 20, timeLimit: 300, respawn: 6 },
  survival: { name: 'Survival',    firstWave: 2, maxBots: 7, waveBreak: 4 },
  training: { name: 'Training',    dummies: 4, respawn: 1.5 },
  team:     { name: 'Team Battle', perTeam: 3, killLimit: 30, timeLimit: 300, respawn: 6 },
  campaign: { name: 'Campaign' },
  online:   { name: 'Online',      size: 6, killLimit: 20, timeLimit: 300, respawn: 6 },
};

export const MATCH_LENGTHS = [
  { seconds: 30,  label: '30 s',  kills: { quick: 4,  team: 6,  online: 4 } },
  { seconds: 60,  label: '1 min', kills: { quick: 6,  team: 9,  online: 6 } },
  { seconds: 120, label: '2 min', kills: { quick: 10, team: 15, online: 10 } },
  { seconds: 180, label: '3 min', kills: { quick: 15, team: 22, online: 15 } },
  { seconds: 300, label: '5 min', kills: { quick: 20, team: 30, online: 20 } },
];
export const DEFAULT_MATCH_LENGTH = 300;
export const TIMED_MODES = ['quick', 'team', 'online'];

export function matchRules(mode, seconds = DEFAULT_MATCH_LENGTH) {
  const length = MATCH_LENGTHS.find((l) => l.seconds === seconds);
  const killLimit = length?.kills[mode];
  return killLimit ? { timeLimit: length.seconds, killLimit, label: length.label } : null;
}

export const BANANA_CRATE = { respawn: 40, choices: 3, pickSeconds: 6, randomBonus: 3 };

export const BANANA_METER = {
  max: 100,
  gain: { gold: 40, silver: 30, bronze: 20 },
  streakStep: 3,
  maxMultiplier: 2,
  crateChoices: { gold: 4, silver: 3, bronze: 2 },
  supplyChoices: 4,
  goldShield: 4,
  dropOffset: 60,
  dropLife: 25,
  key: 'KeyX',
};

export const PUZZLE_GRADES = { gold: { label: 'GOLD', under: 5 }, silver: { label: 'SILVER', under: 10 }, bronze: { label: 'BRONZE', under: Infinity } };

export const POWERS = {
  rage:      { name: 'Banana Rage',   icon: '💥', color: '#ff5d3a', seconds: 8,  text: 'Double damage', damage: 2 },
  overdrive: { name: 'Jet Overdrive', icon: '🚀', color: '#4cc9f0', seconds: 10, text: 'Endless jet fuel and 40% more speed', speed: 1.4 },
  bubble:    { name: 'Banana Bubble', icon: '🛡️', color: '#ffe135', seconds: 6,  text: 'No damage at all' },
  rapid:     { name: 'Rapid Fire',    icon: '⚡', color: '#c77dff', seconds: 8,  text: 'Twice the fire rate, no ammo used', fireRate: 0.5 },
  heal:      { name: 'Banana Juice',  icon: '💚', color: '#52b788', seconds: 8,  text: 'Full health and fast healing', regen: 30 },
};

export const DIFFICULTY = {
  easy:   { name: 'Easy',   accuracy: [0.08, 0.28], reaction: 1.4,  damage: 0.3,  burst: 0.5, pause: 1.1, grenades: 0.03, smarts: 0.25, puzzle: { deploy: 45, respawn: 25, crate: 30 } },
  medium: { name: 'Medium', accuracy: [0.22, 0.45], reaction: 0.95, damage: 0.5,  burst: 0.7, pause: 0.7, grenades: 0.08, smarts: 0.6,  puzzle: { deploy: 30, respawn: 15, crate: 20 } },
  hard:   { name: 'Hard',   accuracy: [0.45, 0.75], reaction: 0.5,  damage: 0.8,  burst: 1.2, pause: 0.4, grenades: 0.25, smarts: 1,    puzzle: { deploy: 20, respawn: 10, crate: 12 } },
};

export const BOT_TACTICS = {
  retreatHealth: 35,
  retreatTime: 3,
  spreadPenalty: 260,
  clusterRadius: 150,
  dodgeTime: 0.4,
  evadeTime: 0.6,
};

export const BOT_NAMES = ['Rex', 'Viper', 'Ghost', 'Blaze', 'Tank', 'Shadow', 'Ace', 'Bolt'];

export const PUZZLE_RULES = {
  deploy:  { seconds: 30, retry: true,  rule: 'Unlimited tries' },
  respawn: { seconds: 15, retry: false, rule: 'One try' },
  crate:   { seconds: 20, retry: false, rule: 'One try' },
};
