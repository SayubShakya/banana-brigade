// Starts Banana Brigade: login, menus, the Banana API puzzles, the avatar customiser
// and the game loop. Screen changes, puzzles and match events travel over the
// event bus, so the world never needs to know about the HUD, sound or menus.
//
// Banana API puzzles appear when you:
//   - press any mode button (solve it to deploy),
//   - go down (solve it for an instant respawn; in Survival it is your only revive),
//   - open a banana crate (solve it for a power weapon).
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../eventBus.js';
import { MODES, WEAPONS, BOT_NAMES, ZOOM_LEVELS } from './config.js';
import { PARTS, DEFAULT_AVATAR, BOT_AVATARS, makeAvatar, drawSoldier, drawAvatarPreview } from './characters.js';
import { createWorld, updateWorld, center, activeGun, revive, rewardBananaCrate, closeBananaCrate, endMatchNow } from './world.js';
import { updateBots } from './bots.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { openPuzzle, isPuzzleOpen } from './puzzle.js';
import { initSound, setListener, setMuted, isMuted, unlockAudio } from './sound.js';
import { fetchMe, logout, initLoginScreen } from './auth.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
const SCREENS = ['login', 'menu', 'avatar', 'controls', 'battle', 'pause', 'results'];
const WEAPON_KEYS = Object.keys(WEAPONS);

const store = {
  get(key, fallback) { try { return localStorage.getItem(`brigade.${key}`) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`brigade.${key}`, value); } catch { /* storage blocked: not saved */ } },
};
const readJson = (key, fallback) => { try { return { ...fallback, ...JSON.parse(store.get(key, '{}')) }; } catch { return { ...fallback }; } };

const canvas = $('battle-canvas');
const renderer = createRenderer(canvas);
const input = createInput(canvas, renderer);
const hud = createHud();
initSound();

let parts = readJson('avatar', DEFAULT_AVATAR);
const stats = readJson('stats', { solved: 0, attempts: 0, streak: 0, best: 0 });
let account = null;   // { id, username, role } from the server session
let world = null;
let session = null;   // puzzle stats and start time for the current deployment
let state = 'menu';   // menu | playing | puzzle | paused | over
let mode = 'quick';
let screen = 'login';
let previewTime = 0;

function show(name) {
  screen = name;
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name && !(name === 'pause' && s === 'battle');
}

const playerName = () => account?.username ?? 'You';

// ---------- Virtual identity: who is playing ----------
function setAccount(user, isNew = false) {
  account = user;
  $('menu-name').textContent = user.username;
  $('menu-role').textContent = user.role;
  $('menu-role').dataset.role = user.role;
  $('menu-welcome').textContent = isNew ? `Welcome to the Brigade, ${user.username}!` : `Welcome back, ${user.username}.`;
  toMenu();
}

on('auth:login', ({ user, isNew }) => setAccount(user, isNew));
$('btn-logout').addEventListener('click', async () => {
  try { await logout(); } finally { account = null; leaveBattle(); show('login'); }
});

// ---------- Banana API status (menu chip) ----------
async function refreshApiStatus() {
  const chip = $('api-status');
  try {
    const s = await (await fetch('/api/status')).json();
    const st = s.online === false ? 'offline' : s.online ? 'online' : 'unknown';
    chip.dataset.state = st;
    $('api-status-text').textContent = st === 'offline'
      ? `Banana API offline${s.reserve ? ` · ${s.reserve} reserve puzzles` : ''}`
      : st === 'online' ? `Banana API online · ${s.ready} ready` : 'Banana API: checking…';
  } catch {
    chip.dataset.state = 'offline';
    $('api-status-text').textContent = 'Server unreachable';
  }
}
setInterval(() => { if (screen === 'menu') refreshApiStatus(); }, 10000);

// ---------- Puzzle stats ----------
const newSession = () => ({
  solved: 0, attempts: 0, streak: 0, best: 0, started: performance.now(),
  byPurpose: { deploy: { solved: 0, attempts: 0 }, respawn: { solved: 0, attempts: 0 }, crate: { solved: 0, attempts: 0 } },
});

on('banana:answered', ({ correct, purpose }) => {
  stats.attempts += 1;
  if (correct) { stats.solved += 1; stats.streak += 1; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
  store.set('stats', JSON.stringify(stats));
  if (session) {
    const p = session.byPurpose[purpose];
    p.attempts += 1;
    session.attempts += 1;
    if (correct) { p.solved += 1; session.solved += 1; session.streak += 1; session.best = Math.max(session.best, session.streak); } else session.streak = 0;
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
  const result = await openPuzzle(purpose, { modeLabel: MODES[mode].name, ...options, stats });
  delete document.body.dataset.overlay;
  return result;
}

// ---------- Deploying: Banana puzzle first ----------
async function deploy(m) {
  if (isPuzzleOpen()) return;
  unlockAudio();
  mode = m;
  session = newSession();
  const result = await puzzle('deploy', { title: 'Deploy', subtitle: 'Solve the Banana puzzle to drop into battle.' });
  if (result === 'solved') startBattle();
  else session = null;
}

function startBattle() {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const looks = [...BOT_AVATARS].sort(() => Math.random() - 0.5);
  world = createWorld({ mode, playerName: playerName(), playerAvatar: makeAvatar(parts), botAvatars: looks, botNames: names });
  session ??= newSession();
  session.started = performance.now();
  hud.attach(world);
  state = 'playing';
  input.setEnabled(true);
  show('battle');
}

function leaveBattle() {
  world = null;
  session = null;
  state = 'menu';
  input.setEnabled(false);
  hud.hide();
}

function toMenu() {
  leaveBattle();
  drawAvatarPreview($('menu-avatar'), makeAvatar(parts));
  renderMenuStats();
  show('menu');
  refreshApiStatus();
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  input.setEnabled(true);
  show('battle');
}

// Freezes the world while an in-battle puzzle is open, then hands control back.
async function inGamePuzzle(purpose, options) {
  if (!world || isPuzzleOpen() || state !== 'playing') return null;
  state = 'puzzle';
  input.setEnabled(false);
  const result = await puzzle(purpose, options);
  if (world && !world.over && state === 'puzzle') { state = 'playing'; input.setEnabled(true); }
  return result;
}

// ---------- Banana respawn ----------
async function bananaRespawn() {
  if (!world || world.player.alive || world.over) return;
  const survival = world.mode === 'survival';
  const result = await inGamePuzzle('respawn', {
    title: survival ? 'Banana revive' : 'Banana respawn',
    subtitle: survival ? 'Solve it to get back in the fight. Miss and the run is over.' : 'Solve it to respawn right now instead of waiting.',
    cancelText: survival ? 'Give up' : 'Wait instead',
  });
  if (!world || result === null) return;
  if (result === 'solved') revive(world, world.player);
  else if (survival) endMatchNow(world, 'down');
}

on('input:banana', bananaRespawn);
$('center-msg').addEventListener('click', bananaRespawn);
on('player:down', () => setTimeout(bananaRespawn, 1200));

// ---------- Banana crates ----------
on('banana:crate', async ({ pickup }) => {
  if (!pickup.active) return;
  const result = await inGamePuzzle('crate', {
    title: 'Banana crate',
    subtitle: 'Solve it for a power weapon, full health and +2 grenades.',
    cancelText: 'Leave it',
  });
  if (!world || result === null || result === 'cancelled') return;
  if (result === 'solved') rewardBananaCrate(world, world.player);
  closeBananaCrate(pickup);
});

// ---------- Pause ----------
on('input:pause', () => {
  if (isPuzzleOpen()) return;
  if (state === 'playing') { state = 'paused'; input.setEnabled(false); show('pause'); }
  else if (state === 'paused') resume();
});

// ---------- Results and saving the score ----------
function outcome({ ranking, player, reason, mode: m, wave, teamKills }) {
  if (m === 'survival') return { won: false, title: `Wave ${wave}`, line: `You held out until wave ${wave} with ${player.kills} kills.` };
  if (m === 'training') return { won: false, title: 'Training over', line: `${player.kills} dummies down. Training is not ranked.` };
  const why = reason === 'time' ? 'Time is up.' : reason === 'quit' ? 'You ended the battle.' : 'Kill limit reached.';
  if (m === 'team') {
    const won = teamKills.blue > teamKills.red;
    return { won, title: won ? 'Blue team wins!' : teamKills.blue === teamKills.red ? 'Draw' : 'Red team wins', line: `Blue ${teamKills.blue} – ${teamKills.red} Red · ${why}` };
  }
  const won = ranking[0] === player;
  return { won, title: won ? 'Victory!' : `${ranking[0].name} wins`, line: why };
}

async function saveScore(result, won, durationS) {
  const note = $('results-saved');
  if (result.mode === 'training') { note.textContent = ''; return; }
  note.dataset.state = '';
  note.textContent = 'Saving your score…';
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: result.mode, kills: result.player.kills, deaths: result.player.deaths,
        wave: result.wave, won, durationS: Math.min(3600, durationS),
      }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    note.dataset.state = 'ok';
    note.textContent = `Score saved to ${playerName()}'s record.`;
  } catch (err) {
    note.dataset.state = 'error';
    note.textContent = `Score not saved: ${err.message}`;
  }
}

function showResults(result) {
  state = 'over';
  input.setEnabled(false);
  const s = session ?? newSession();
  const secs = Math.round((performance.now() - s.started) / 1000);
  const { won, title, line } = outcome(result);
  $('results-mode').textContent = MODES[result.mode].name;
  $('results-title').textContent = title;
  $('results-reason').textContent = line;
  $('res-solved').textContent = `${s.solved} / ${s.attempts}`;
  $('res-accuracy').textContent = s.attempts ? `${Math.round((s.solved / s.attempts) * 100)}%` : '—';
  $('res-streak').textContent = s.best;
  $('res-time').textContent = fmtTime(secs);
  $('res-purposes').innerHTML = [['deploy', 'Deploy'], ['respawn', 'Respawn'], ['crate', 'Crates']]
    .map(([k, label]) => `<div>${label}<b>${s.byPurpose[k].solved} / ${s.byPurpose[k].attempts}</b></div>`).join('');
  $('results-body').innerHTML = result.ranking.map((r, i) =>
    `<tr class="${r.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}${result.mode === 'team' ? ` <small class="team-${r.team}">${r.team}</small>` : ''}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`).join('');
  hud.hide();
  show('results');
  saveScore(result, won, secs);
}

on('match:ended', (result) => setTimeout(() => { if (world?.over) showResults(result); }, 1500));

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
document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', toMenu));
$('btn-resume').addEventListener('click', resume);
$('btn-end').addEventListener('click', () => { if (world) { resume(); endMatchNow(world, 'quit'); } });
$('btn-quit').addEventListener('click', toMenu);
$('btn-again').addEventListener('click', () => { const m = mode; toMenu(); deploy(m); });
$('btn-menu').addEventListener('click', toMenu);
$('btn-mute').addEventListener('click', () => {
  setMuted(!isMuted());
  $('btn-mute').textContent = isMuted() ? 'Sound: Off' : 'Sound: On';
});

// ---------- Game loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (world) {
    const running = state === 'playing' || state === 'over';
    if (running) {
      if (state === 'playing' && world.player.alive) input.apply(world.player);
      updateBots(world, dt);
      updateWorld(world, dt);
      const c = center(world.player);
      setListener(c.x, c.y);
    }
    // 3x zoom only with a scoped weapon (the sniper); everything else stops at 2x.
    const maxZoom = (WEAPONS[activeGun(world.player).key].zoom ?? 2) - 1;
    renderer.render(world, input.mouse, running ? dt : 0, ZOOM_LEVELS[Math.min(input.zoom, maxZoom)]);
    hud.update();
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

// Preview links, e.g. index.html#battle-team or #puzzle-crate, open a screen directly
// without solving a puzzle first, so each screen can be reviewed and screenshotted.
function openPreview() {
  const [name, arg] = location.hash.slice(1).split('-');
  if (name === 'battle' || name === 'pause') {
    mode = MODES[arg] ? arg : 'quick';
    session = newSession();
    startBattle();
    if (name === 'pause') { state = 'paused'; input.setEnabled(false); show('pause'); }
  } else if (name === 'puzzle') {
    const purpose = ['deploy', 'respawn', 'crate'].includes(arg) ? arg : 'deploy';
    const titles = { deploy: 'Deploy', respawn: 'Banana respawn', crate: 'Banana crate' };
    puzzle(purpose, { modeLabel: 'Quick Play', title: titles[purpose], subtitle: 'Preview of the puzzle screen.' });
  } else if (name === 'avatar') { buildAvatarScreen(); show('avatar'); }
  else if (name === 'controls') show('controls');
}
