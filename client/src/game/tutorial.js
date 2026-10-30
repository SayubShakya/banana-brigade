// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { on, emit } from '../services/eventBus.js';
import { TILE } from './config.js';

export const BOOT_CAMP = { id: 'bootcamp', bootCamp: true, name: 'Boot Camp', map: 'jungle' };
export const JET_HOLD = 0.5;
export const DONE_SECONDS = 3;
export const CRATE_RETURN = 2;
const DUMMIES = 2;
const OFF_MAP = -10000;
const PLAYER_SPOT = [3, 31];
const DUMMY_SPOTS = [[16, 30], [20, 28]];

export const STEPS = [
  { id: 'move', title: 'Move', text: 'Walk left and right.', keys: ['A', 'D'] },
  { id: 'jet', title: 'Jetpack', text: 'Hold W or Space to fly. Let go to glide down.', keys: ['W'] },
  { id: 'shoot', title: 'Aim and shoot', text: 'Point the mouse at a dummy and click to shoot it.', keys: ['Mouse', 'Click'] },
  { id: 'gun', title: 'Grab a gun', text: 'Stand on a weapon crate and press E to swap guns.', keys: ['E'] },
  { id: 'crate', title: 'Banana crate', text: 'Find the yellow banana crate and press E to open it.', keys: ['E'] },
  { id: 'puzzle', title: 'Solve the Banana puzzle', text: 'Every banana hides the same digit. Find it in any sum and type it or tap the keypad.', keys: ['0', '9'] },
  { id: 'power', title: 'Choose a power', text: 'Pick one Banana Power. It lasts a few seconds.' },
  { id: 'done', title: 'Boot Camp complete!', text: 'You are ready for battle. Try Campaign mission 1 next.' },
];

export const BOOT_CAMP_EVENTS = ['input:move', 'input:jet', 'soldier:damaged', 'pickup:taken', 'banana:crate', 'banana:answered', 'power:start'];

const byPlayer = (s) => !!s?.isPlayer;

export function createTutorial() {
  let index = 0;
  const moved = { left: false, right: false };
  let jetFrom = null;
  const next = () => { index += 1; return true; };

  function handle(event, p = {}) {
    switch (STEPS[index].id) {
      case 'move':
        if (event !== 'input:move' || !p.dir) return false;
        moved[p.dir < 0 ? 'left' : 'right'] = true;
        return moved.left && moved.right ? next() : false;
      case 'jet':
        if (event !== 'input:jet') return false;
        if (p.on) { jetFrom = p.time ?? 0; return false; }
        if (jetFrom !== null && (p.time ?? 0) - jetFrom >= JET_HOLD) return next();
        jetFrom = null;
        return false;
      case 'shoot':
        return event === 'soldier:damaged' && !!p.victim?.isDummy && byPlayer(p.attacker) ? next() : false;
      case 'gun':
        return event === 'pickup:taken' && p.kind === 'weapon' && byPlayer(p.soldier) ? next() : false;
      case 'crate':
        return event === 'banana:crate' && byPlayer(p.soldier) ? next() : false;
      case 'puzzle':
        if (event !== 'banana:answered' || p.purpose !== 'crate') return false;
        if (p.correct) return next();
        index -= 1;
        return true;
      case 'power':
        return event === 'power:start' && byPlayer(p.soldier) ? next() : false;
      default:
        return false;
    }
  }

  return {
    handle,
    get index() { return index; },
    get step() { return STEPS[index]; },
    get done() { return STEPS[index].id === 'done'; },
  };
}

let active = null;

const stepPayload = (t) => ({ ...t.step, index: t.index, total: STEPS.length - 1 });

function announce(t, retry = false) {
  emit('tutorial:step', { ...stepPayload(t), retry });
  if (t.done) active.doneTimer = setTimeout(() => emit('tutorial:done'), DONE_SECONDS * 1000);
}

export function startBootCamp() {
  stopBootCamp();
  const t = createTutorial();
  active = { t, doneTimer: null, offs: [] };
  active.offs = BOOT_CAMP_EVENTS.map((name) => on(name, (p) => {
    const before = t.index;
    if (t.handle(name, p)) announce(t, t.index < before);
  }));
  announce(t);
}

export function stopBootCamp() {
  if (!active) return;
  active.offs.forEach((off) => off());
  clearTimeout(active.doneTimer);
  active = null;
  emit('tutorial:step', null);
}

export const bootCampStep = () => (active ? stepPayload(active.t) : null);
export const isBootCamp = (world) => !!world?.mission?.bootCamp;

function standAt(s, [col, row]) {
  s.x = col * TILE + TILE / 2 - s.w / 2;
  s.y = (row + 1) * TILE - s.h - 1;
  s.vx = 0;
  s.vy = 0;
}

export function setUpRange(soldiers) {
  const dummies = soldiers.filter((s) => s.isDummy);
  dummies.slice(DUMMIES).forEach((d) => soldiers.splice(soldiers.indexOf(d), 1));
  const player = soldiers.find((s) => s.isPlayer);
  if (player) standAt(player, PLAYER_SPOT);
  dummies.slice(0, DUMMIES).forEach((d, i) => standAt(d, DUMMY_SPOTS[i]));
}

on('match:started', ({ soldiers, mode }) => { if (active && mode === 'training') setUpRange(soldiers); });

export const CRATE_STEP = STEPS.findIndex((s) => s.id === 'crate');

export function tutorialTick(world, stepIndex = active?.t.index ?? CRATE_STEP) {
  if (!isBootCamp(world)) return;
  for (const p of world.pickups) {
    if (p.kind === 'banana') {
      p.home ??= p.x;
      p.x = stepIndex < CRATE_STEP ? OFF_MAP : p.home;
    }
    if (!p.active && p.timer > CRATE_RETURN) p.timer = CRATE_RETURN;
  }
}
