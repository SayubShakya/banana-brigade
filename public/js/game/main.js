// Banana Brigade screens: main menu, Banana API puzzles, battle HUD, pause, avatar,
// controls and results. There is no gameplay; the battle screen shows the HUD over a
// posed battlefield so the interface can be designed and tried out.
//
// Banana API puzzles appear when you:
//   - press any mode button (solve it to deploy),
//   - go down in battle (solve it for a Banana respawn),
//   - open a banana crate (solve it for a power weapon).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../eventBus.js';
import { MODES, WEAPONS, CRATE_REWARDS, BOT_NAMES, VIEW } from './config.js';
import { PARTS, DEFAULT_AVATAR, BOT_AVATARS, makeAvatar, drawSoldier, drawAvatarPreview } from './characters.js';
import { drawScene } from './scene.js';
import { createHud } from './hud.js';
import { openPuzzle, isPuzzleOpen } from './puzzle.js';
import { fetchMe, logout, initLoginScreen } from './auth.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['login', 'menu', 'avatar', 'controls', 'battle', 'pause', 'results'];
const ZOOMS = [1, 0.8, 0.65];

const store = {
  get(key, fallback) { try { return localStorage.getItem(`brigade.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`brigade.${key}`, value); } catch { /* storage blocked: not saved */ } },
};
const readJson = (key, fallback) => { try { return { ...fallback, ...JSON.parse(store.get(key, '{}')) }; } catch { return { ...fallback }; } };

let parts = readJson('avatar', DEFAULT_AVATAR);
const stats = readJson('stats', { solved: 0, attempts: 0, streak: 0, best: 0 });
let session = null;   // stats for the current deployment
let mode = 'quick';
let cast = [];
let screen = 'menu';
let previewTime = 0;
const hud = createHud();

function show(name) {
  screen = name;
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name && !(name === 'pause' && s === 'battle');
  if (name === 'battle' || name === 'pause') return;
  hud.hide();
}

let account = null; // { id, username, role } from the server session
const playerName = () => account?.username ?? 'You';

// ---------- Virtual identity: who is playing ----------
function setAccount(user, isNew = false) {
  account = user;
  $('menu-name').textContent = user.username;
  $('menu-role').textContent = user.role;
  $('menu-role').dataset.role = user.role;
  $('menu-welcome').textContent = isNew ? `Welcome to the Brigade, ${user.username}!` : `Welcome back, ${user.username}.`;
  show('menu');
  refreshApiStatus();
}

on('auth:login', ({ user, isNew }) => setAccount(user, isNew));
$('btn-logout').addEventListener('click', async () => {
  try { await logout(); } finally { account = null; session = null; show('login'); }
});

// ---------- Puzzle stats ----------
const newSession = () => ({
  solved: 0, attempts: 0, streak: 0, best: 0, started: 0,
  byPurpose: { deploy: { solved: 0, attempts: 0 }, respawn: { solved: 0, attempts: 0 }, crate: { solved: 0, attempts: 0 } },
});

// ---------- Banana API status (menu chip) ----------
async function refreshApiStatus() {
  const chip = $('api-status');
  try {
    const s = await (await fetch('/api/status')).json();
    const state = s.online === false ? 'offline' : s.online ? 'online' : 'unknown';
    chip.dataset.state = state;
    $('api-status-text').textContent = state === 'offline'
      ? `Banana API offline${s.reserve ? ` · ${s.reserve} reserve puzzles` : ''}`
      : state === 'online' ? `Banana API online · ${s.ready} ready` : 'Banana API: checking…';
  } catch {
    chip.dataset.state = 'offline';
    $('api-status-text').textContent = 'Server unreachable';
  }
}
refreshApiStatus();
setInterval(() => { if (screen === 'menu') refreshApiStatus(); }, 10000);
on('banana:answered', ({ correct, purpose }) => {
  stats.attempts += 1;
  if (correct) { stats.solved += 1; stats.streak += 1; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
  store.set('stats', JSON.stringify(stats));
  if (session) {
    const p = session.byPurpose[purpose];
    p.attempts += 1;
    if (correct) p.solved += 1;
    session.attempts += 1;
    if (correct) { session.solved += 1; session.streak += 1; session.best = Math.max(session.best, session.streak); } else session.streak = 0;
  }
  renderMenuStats();
});

function renderMenuStats() {
  $('stat-solved').textContent = stats.solved;
  $('stat-best').textContent = stats.best;
  $('stat-accuracy').textContent = stats.attempts ? `${Math.round((stats.solved / stats.attempts) * 100)}%` : '—';
}

async function puzzle(purpose, options) {
  document.body.dataset.overlay = 'puzzle';
  const result = await openPuzzle(purpose, { ...options, stats });
  delete document.body.dataset.overlay;
  return result;
}

// ---------- Deploying: Banana puzzle first ----------
async function deploy(m) {
  if (isPuzzleOpen()) return;
  mode = m;
  session = newSession();
  const result = await puzzle('deploy', {
    modeLabel: MODES[m].name,
    title: 'Deploy',
    subtitle: 'Solve the Banana puzzle to drop into battle.',
  });
  if (result === 'solved') startBattle();
  else session = null;
}

// Soldiers posed on the battlefield around the player (world pixels, feet position).
const SPOTS = [
  { x: 1540, y: 1040, facing: 1 },
  { x: 1060, y: 840, facing: 1 },
  { x: 1960, y: 880, facing: -1, flying: true },
  { x: 1760, y: 960, facing: -1, flying: true },
  { x: 1250, y: 1280, facing: 1 },
  { x: 1900, y: 1160, facing: -1 },
];
const WEAPON_KEYS = Object.keys(WEAPONS);

function buildCast() {
  const player = { name: playerName(), avatar: makeAvatar(parts), isPlayer: true, weapon: 'rifle', team: mode === 'team' ? 'blue' : 'me', ...SPOTS[0] };
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const looks = [...BOT_AVATARS].sort(() => Math.random() - 0.5);
  let bots = SPOTS.slice(1).map((spot, i) => ({ name: names[i], avatar: looks[i], weapon: WEAPON_KEYS[(i + 1) % WEAPON_KEYS.length], team: 'enemy', ...spot }));
  if (mode === 'team') bots.forEach((b, i) => { b.team = i === 0 || i === 3 ? 'blue' : 'red'; });
  if (mode === 'survival') bots = bots.slice(1, 3);
  if (mode === 'training') bots = [bots[0], bots[1], bots[3]].map((b) => ({ ...b, name: 'Dummy', weapon: 'magnum', flying: false }));
  return [player, ...bots];
}

function startBattle() {
  cast = buildCast();
  session.started = performance.now();
  show('battle');
  hud.show({ mode, player: cast[0], cast });
}

// ---------- In-battle Banana puzzles ----------
on('hud:respawn', async () => {
  if (screen !== 'battle' || isPuzzleOpen()) return;
  const survival = mode === 'survival';
  const result = await puzzle('respawn', {
    modeLabel: MODES[mode].name,
    title: survival ? 'Banana revive' : 'Banana respawn',
    subtitle: survival ? 'Solve it to get back in the fight. Miss and the run is over.' : 'Solve it to respawn right now instead of waiting.',
    cancelText: survival ? 'Give up' : 'Wait instead',
  });
  if (result === 'solved') hud.setDown(false);
  else if (survival) endBattle();
});

on('hud:crate', async () => {
  if (screen !== 'battle' || isPuzzleOpen() || hud.crateOpen) return;
  const result = await puzzle('crate', {
    modeLabel: MODES[mode].name,
    title: 'Banana crate',
    subtitle: 'Solve it for a power weapon, full health and +2 grenades.',
    cancelText: 'Leave it',
  });
  if (result === 'solved') hud.rewardCrate(CRATE_REWARDS[Math.floor(Math.random() * CRATE_REWARDS.length)]);
  else if (result === 'failed') hud.closeCrate();
});

on('hud:pause', () => {
  if (isPuzzleOpen()) return;
  if (screen === 'battle') show('pause');
  else if (screen === 'pause') show('battle');
});

// ---------- Results ----------
function endBattle() {
  const s = session ?? { ...newSession(), started: performance.now() };
  const secs = Math.round((performance.now() - s.started) / 1000);
  $('results-mode').textContent = MODES[mode].name;
  $('results-title').textContent = s.attempts && s.solved === s.attempts ? 'Perfect run!' : 'Battle over';
  $('res-solved').textContent = `${s.solved} / ${s.attempts}`;
  $('res-accuracy').textContent = s.attempts ? `${Math.round((s.solved / s.attempts) * 100)}%` : '—';
  $('res-streak').textContent = s.best;
  $('res-time').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const by = s.byPurpose ?? newSession().byPurpose;
  $('res-purposes').innerHTML = [['deploy', 'Deploy'], ['respawn', 'Respawn'], ['crate', 'Crates']]
    .map(([k, label]) => `<div>${label}<b>${by[k].solved} / ${by[k].attempts}</b></div>`).join('');
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  $('results-body').innerHTML = cast.filter((c) => c.name !== 'Dummy').map((c, i) =>
    `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${esc(c.name)}${mode === 'team' ? ` <small class="team-${c.team}">${c.team}</small>` : ''}</td><td>0</td><td>0</td></tr>`).join('');
  session = null;
  show('results');
}

// ---------- Avatar customiser ----------
function swatchRow(container, values, current, onPick, label = (v) => v) {
  container.innerHTML = '';
  for (const v of values) {
    const b = document.createElement('button');
    b.type = 'button';
    const value = typeof v === 'object' ? v.id : v;
    b.className = `swatch${value === current ? ' selected' : ''}`;
    if (typeof v === 'object' && v.main) b.style.background = v.main;
    else if (typeof v === 'string') b.style.background = v;
    b.title = label(v);
    b.setAttribute('aria-label', label(v));
    b.setAttribute('aria-pressed', value === current ? 'true' : 'false');
    if (typeof v === 'object' && !v.main) { b.textContent = v.name; b.classList.add('text'); }
    b.addEventListener('click', () => onPick(value));
    container.append(b);
  }
}

function setParts(next) {
  parts = next;
  store.set('avatar', JSON.stringify(parts));
  buildAvatarScreen();
  drawAvatarPreview($('menu-avatar'), makeAvatar(parts));
}

function buildAvatarScreen() {
  const pick = (key) => (value) => setParts({ ...parts, [key]: value });
  swatchRow($('opt-hat'), PARTS.hat, parts.hat, pick('hat'), (v) => v.name);
  swatchRow($('opt-skin'), PARTS.skin, parts.skin, pick('skin'), () => 'Skin tone');
  swatchRow($('opt-uniform'), PARTS.uniform, parts.uniform, pick('uniform'), (v) => v.name);
  swatchRow($('opt-goggles'), PARTS.goggles, parts.goggles, pick('goggles'), () => 'Goggles colour');
  $('opt-beard').textContent = parts.beard ? 'Beard: on' : 'Beard: off';
  $('opt-beard').setAttribute('aria-pressed', parts.beard ? 'true' : 'false');
  $('avatar-name').textContent = playerName();
}

const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
$('opt-beard').addEventListener('click', () => setParts({ ...parts, beard: !parts.beard }));
$('btn-random').addEventListener('click', () => setParts({
  hat: randomOf(PARTS.hat).id, uniform: randomOf(PARTS.uniform).id, skin: randomOf(PARTS.skin), goggles: randomOf(PARTS.goggles), beard: Math.random() < 0.3,
}));
$('btn-reset').addEventListener('click', () => setParts({ ...DEFAULT_AVATAR }));

function animatePreview(dt) {
  previewTime += dt;
  const c = $('avatar-preview');
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.save();
  ctx.scale(c.width / 90, c.height / 110);
  const weapon = WEAPON_KEYS[Math.floor(previewTime / 2) % WEAPON_KEYS.length];
  const flying = Math.floor(previewTime / 4) % 2 === 1;
  drawSoldier(ctx, {
    x: 31, y: 40 + (flying ? -8 + Math.sin(previewTime * 3) * 3 : 0), w: 28, h: 50, facing: 1,
    aim: Math.sin(previewTime * 1.3) * 0.6, walkPhase: previewTime * 9, onGround: !flying, jetting: flying, weapon, hurtFlash: 0,
  }, makeAvatar(parts), previewTime);
  ctx.restore();
  $('avatar-weapon').textContent = WEAPONS[weapon].name;
}

// ---------- Buttons ----------
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => deploy(b.dataset.mode)));
$('btn-avatar').addEventListener('click', () => { buildAvatarScreen(); show('avatar'); });
$('btn-controls').addEventListener('click', () => show('controls'));
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => show('menu')));
$('btn-resume').addEventListener('click', () => show('battle'));
$('btn-test-down').addEventListener('click', () => { show('battle'); hud.setDown(true); });
$('btn-end').addEventListener('click', endBattle);
$('btn-quit').addEventListener('click', () => { session = null; show('menu'); });
$('btn-again').addEventListener('click', () => { show('menu'); deploy(mode); });
$('btn-menu').addEventListener('click', () => { show('menu'); refreshApiStatus(); });

// ---------- Animation loop (backdrop, HUD bars, avatar preview) ----------
const canvas = $('battle-canvas');
function resizeCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = VIEW.width * dpr;
  canvas.height = VIEW.height * dpr;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (screen === 'battle' || screen === 'pause') {
    const zoom = ZOOMS[Number($('hud').dataset.zoom || 0)];
    const shown = hud.down ? cast.slice(1) : cast;
    drawScene(canvas, { cast: shown, focus: { x: cast[0].x, y: cast[0].y - 25 }, time: now / 1000, crateOpen: hud.crateOpen, zoom });
    if (screen === 'battle') hud.update(dt);
  } else if (screen === 'avatar') {
    animatePreview(dt);
  }
  requestAnimationFrame(frame);
}

initLoginScreen();
drawAvatarPreview($('menu-avatar'), makeAvatar(parts));
renderMenuStats();
show('login');
requestAnimationFrame(frame);

// Already logged in (the session cookie is still valid)? Skip the login screen.
fetchMe().then(({ user }) => {
  if (user) { setAccount(user); openPreview(); }
}).catch(() => { /* server unreachable: stay on the login screen */ });

// Design preview links, e.g. index.html#battle-team or #results, open a screen directly
// without solving a puzzle first, so each screen can be reviewed on its own.
function openPreview() {
  const [name, arg] = location.hash.slice(1).split('-');
  if (name === 'battle' || name === 'pause' || name === 'results') {
    mode = MODES[arg] ? arg : 'quick';
    session = { ...newSession(), solved: 1, attempts: 1, streak: 1, best: 1 };
    session.byPurpose.deploy = { solved: 1, attempts: 1 };
    startBattle();
    session.started = performance.now() - 95000;
    if (name === 'pause') show('pause');
    if (name === 'results') endBattle();
    if (arg === 'down') hud.setDown(true);
  } else if (name === 'puzzle') {
    const purpose = ['deploy', 'respawn', 'crate'].includes(arg) ? arg : 'deploy';
    const titles = { deploy: 'Deploy', respawn: 'Banana respawn', crate: 'Banana crate' };
    puzzle(purpose, { modeLabel: 'Quick Play', title: titles[purpose], subtitle: 'Design preview of the puzzle screen.' });
  } else if (name === 'avatar') { buildAvatarScreen(); show('avatar'); }
  else if (name === 'controls') show('controls');
}
