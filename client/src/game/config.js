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
  airAccel: 1500,         // px/s² horizontal acceleration in the air
  airTurnBoost: 1.7,      // extra air acceleration when steering against your drift (snappier turns)
  airDrag: 2.2,           // how fast horizontal drift dies in the air with no key held (per second)
  jetThrust: 3300,        // px/s² upward while the jetpack fires
  jetLiftBoost: 1.5,      // thrust multiplier while still falling: quick lift-off and catching falls
  jetEase: 0.35,          // thrust fades by up to this share near maxRise, so top speed arrives smoothly
  takeoffKick: 230,       // px/s instant upward pop when the jetpack starts from the ground
  takeoffFuel: 3,         // fuel the take-off pop costs
  coyoteTime: 0.12,       // seconds after walking off a ledge that still count as "on the ground"
  jumpBuffer: 0.15,       // seconds a jet press is remembered before landing
  landMinSpeed: 260,      // px/s fall speed needed for a 'soldier:landed' (dust) event; no fall damage
  sputterCooldown: 0.5,   // seconds between 'jetpack:sputter' events when the tank is empty
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
  meleeDamage: 25,
  meleeRange: 48,
  meleeCooldown: 0.8,
};

// type: 'bullet' (tracer), 'rocket' (slow, explodes) or 'flame' (short-lived fire puffs)
// falloff: damage drops after `start` px of travel down to `min` x at full range (shotgun).
// headshot: damage multiplier for a bullet that hits the head (see HEADSHOT_ZONE below).
//   Every bullet gun has one; rockets and flames never headshot.
// selfDamage: share of its own blast the shooter takes (rocket jumps hurt less).
// drag: how quickly flame puffs slow down (per second).
//
// Time to kill a full-health (100 HP) soldier, every shot hitting, no armour:
//   weapon     dmg/hit (body / head)    shots body / head  TTK body / head (s)  notes
//   Magnum     25 / 37.5                4 / 3              1.02 / 0.68          sidearm, infinite ammo
//   SMG        10 / 13                  10 / 8             0.63 / 0.49          wide spread: real TTK is close range only
//   Rifle      15 / 22.5                7 / 5              0.66 / 0.44          tight spread, the all-rounder
//   Shotgun    7x12 = 84 / 7x15 = 105   2 / 1              0.80 / 0             point blank; ~50 per shot at 300 px (falloff)
//   Sniper     70 / 140                 2 / 1              1.30 / 0             one-shot only on a headshot
//   Rocket     ~70 direct               2                  1.20                 splash; 40% self-damage; never a headshot
//   Flamer     4 per puff               25                 ~1.0                 25 puffs/s, short range (~250 px); never a headshot
// (A shotgun headshot needs all 7 pellets in the head at point blank, so it is rare.)
// The Magnum is the slowest on purpose (always available); every crate weapon beats it.
export const WEAPONS = {
  magnum:  { name: 'Magnum',          type: 'bullet', damage: 25, rate: 0.34, mag: 8,   spareMags: Infinity, reload: 1.2, speed: 1600, spread: 0.025, pellets: 1, range: 950,  color: '#ffe08a', headshot: 1.5 },
  smg:     { name: 'SMG',             type: 'bullet', damage: 10, rate: 0.07, mag: 32,  spareMags: 3, reload: 1.6, speed: 1600, spread: 0.09, pellets: 1, range: 800,  color: '#ffd166', headshot: 1.3 },
  rifle:   { name: 'Assault Rifle',   type: 'bullet', damage: 15, rate: 0.11, mag: 30,  spareMags: 3, reload: 1.9, speed: 1900, spread: 0.04, pellets: 1, range: 1100, color: '#ffd166', headshot: 1.5 },
  shotgun: { name: 'Shotgun',         type: 'bullet', damage: 12, rate: 0.8,  mag: 6,   spareMags: 3, reload: 2.0, speed: 1400, spread: 0.22, pellets: 7, range: 430,  color: '#ffb703', falloff: { start: 120, min: 0.3 }, headshot: 1.25 },
  sniper:  { name: 'Sniper',          type: 'bullet', damage: 70, rate: 1.3,  mag: 5,   spareMags: 3, reload: 2.4, speed: 2800, spread: 0.0,  pellets: 1, range: 2000, color: '#ffffff', zoom: 3, headshot: 2.0 },
  rocket:  { name: 'Rocket Launcher', type: 'rocket', damage: 75, rate: 1.2,  mag: 2,   spareMags: 2, reload: 2.5, speed: 720,  spread: 0.01, pellets: 1, range: 1600, color: '#ff6b35', blastRadius: 120, selfDamage: 0.4 },
  flamer:  { name: 'Flamethrower',    type: 'flame',  damage: 4,  rate: 0.04, mag: 100, spareMags: 1, reload: 2.2, speed: 620,  spread: 0.15, pellets: 1, range: 320,  color: '#ff7b00', drag: 1.0 },
};

// Headshots. The head is drawn as a circle (characters.js) centred 9 px below the top of
// the 50 px soldier box with a 14.5 px radius, so it covers roughly y-5.5 .. y+23.5.
// A bullet counts as a headshot when it enters the top 45% of the box (22.5 px), or
// when it clips the small "head cap" box that sticks HEAD_CAP_ABOVE px above the
// soldier box, HEAD_CAP_HALF_WIDTH px either side of the centre (over the drawn head).
// Bots fire through the same code, so they follow the same rules.
export const HEADSHOT_ZONE = 0.45;
export const HEAD_CAP_ABOVE = 6;
export const HEAD_CAP_HALF_WIDTH = 9;

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
  // Power-ups that sometimes appear at weapon crate spots instead of a weapon
  // (rolled every time a crate spot respawns, so they follow weaponRespawn).
  powerupChance: 0.3,
  powerups: ['shield', 'fuel', 'ammo'],
  shieldAmount: 50,       // damage the shield absorbs
  shieldTime: 10,         // seconds before an unused shield fades
  fuelBoostTime: 6,       // seconds of infinite jet fuel (after an instant refill)
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
  campaign: { name: 'Campaign' },   // the real rules come from the mission (campaign.js)
  online:   { name: 'Online',      size: 6, killLimit: 20, timeLimit: 300, respawn: 6 },   // humans first, bots fill up to size
};

// Banana crates open a Banana API puzzle; solving it gives a power weapon.
// Banana crates: solve the puzzle, then choose one of `choices` random powers (or
// take a random one for `randomBonus` extra seconds). A taken crate returns after `respawn` s.
export const BANANA_CRATE = { respawn: 40, choices: 3, pickSeconds: 6, randomBonus: 3 };

// Banana Powers: short super powers from banana crates. Only one is active at a time.
export const POWERS = {
  rage:      { name: 'Banana Rage',   icon: '💥', color: '#ff5d3a', seconds: 8,  text: 'Double damage', damage: 2 },
  overdrive: { name: 'Jet Overdrive', icon: '🚀', color: '#4cc9f0', seconds: 10, text: 'Endless jet fuel and 40% more speed', speed: 1.4 },
  bubble:    { name: 'Banana Bubble', icon: '🛡️', color: '#ffe135', seconds: 6,  text: 'No damage at all' },
  rapid:     { name: 'Rapid Fire',    icon: '⚡', color: '#c77dff', seconds: 8,  text: 'Twice the fire rate, no ammo used', fireRate: 0.5 },
  heal:      { name: 'Banana Juice',  icon: '💚', color: '#52b788', seconds: 8,  text: 'Full health and fast healing', regen: 30 },
};

// Difficulty, chosen before every battle. It changes the bots and the Banana puzzle
// timers. Bots: accuracy is a range per bot (higher aims better); reaction is how
// long a bot must see you before it fires; damage scales what bots do to human
// players; burst/pause make bots fire in bursts. smarts (0-1) is how often bots use
// tactics: retreating when hurt, dodging fire and rockets, spreading targets, grenading
// groups. puzzle: seconds per puzzle type.
export const DIFFICULTY = {
  easy:   { name: 'Easy',   accuracy: [0.10, 0.35], reaction: 1.2,  damage: 0.4,  burst: 0.5, pause: 1.1, grenades: 0.03, smarts: 0.25, puzzle: { deploy: 45, respawn: 25, crate: 30 } },
  medium: { name: 'Medium', accuracy: [0.30, 0.55], reaction: 0.75, damage: 0.65, burst: 0.7, pause: 0.7, grenades: 0.08, smarts: 0.6,  puzzle: { deploy: 30, respawn: 15, crate: 20 } },
  hard:   { name: 'Hard',   accuracy: [0.55, 0.90], reaction: 0.35, damage: 1,    burst: 9,   pause: 0,   grenades: 0.25, smarts: 1,    puzzle: { deploy: 20, respawn: 10, crate: 12 } },
};

// Bot tactics thresholds (how much they are used depends on DIFFICULTY smarts).
export const BOT_TACTICS = {
  retreatHealth: 35,      // below this a bot breaks off and looks for health
  retreatTime: 3,         // seconds a retreat lasts before it re-thinks
  spreadPenalty: 260,     // px added to a target's "distance" for every other bot already on it
  clusterRadius: 150,     // enemies this close to the target count as a group worth a grenade
  dodgeTime: 0.4,         // seconds of strafe + jet after being hit
  evadeTime: 0.6,         // seconds spent getting out of a rocket's or grenade's blast
};

export const BOT_NAMES = ['Rex', 'Viper', 'Ghost', 'Blaze', 'Tank', 'Shadow', 'Ace', 'Bolt'];

// How each kind of Banana puzzle works. Deploying is relaxed (new puzzle after a miss);
// respawns and crates happen mid-battle, so they are quicker and give one try.
export const PUZZLE_RULES = {
  deploy:  { seconds: 30, retry: true,  rule: 'Unlimited tries' },
  respawn: { seconds: 15, retry: false, rule: 'One try' },
  crate:   { seconds: 20, retry: false, rule: 'One try' },
};
