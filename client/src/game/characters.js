// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

export const PARTS = {
  hat: [
    { id: 'headband', name: 'Headband' }, { id: 'none', name: 'Bald' }, { id: 'helmet', name: 'Helmet' },
    { id: 'beret', name: 'Beret' }, { id: 'beanie', name: 'Beanie' }, { id: 'cap', name: 'Cap' },
    { id: 'bandana', name: 'Bandana' }, { id: 'drill', name: 'Drill hat' },
  ],
  skin: ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'],
  uniform: [
    { id: 'woodland', name: 'Woodland', main: '#5f7a3a', dark: '#43572a', pants: '#8f9a5c', camo: '#5d6b3a' },
    { id: 'jungle', name: 'Jungle', main: '#4f7a3a', dark: '#36572a', pants: '#3f6230', camo: '#2c4622' },
    { id: 'desert', name: 'Desert', main: '#c8a165', dark: '#9c7a45', pants: '#d6b77e', camo: '#a8844e' },
    { id: 'arctic', name: 'Arctic', main: '#dfe7ee', dark: '#a9b6c2', pants: '#c9d3dc', camo: '#97a6b3' },
    { id: 'night', name: 'Night', main: '#33333d', dark: '#1e1e26', pants: '#2a2a33', camo: '#16161c' },
    { id: 'navy', name: 'Navy', main: '#2c4a7a', dark: '#1d3253', pants: '#2a3f63', camo: '#1a2a45' },
    { id: 'banana', name: 'Banana', main: '#f2c230', dark: '#b8901c', pants: '#6b5a2b', camo: '#4f421f' },
  ],
  goggles: ['#2b2b2b', '#2e86c1', '#00f5d4', '#f4d35e', '#e63946', '#8e44ad'],
  face: [
    { id: 'none', name: 'Clean' }, { id: 'stubble', name: 'Stubble' },
    { id: 'beard', name: 'Beard' }, { id: 'mustache', name: 'Moustache' },
  ],
};

const HAT_COLORS = { beret: '#c0392b', drill: '#b08850', bandana: '#7b2cbf', headband: '#7b2cbf', beanie: '#5b6770', cap: '#3d4f2a' };
const HAIRLESS = new Set(['none', 'headband']);

export function makeAvatar(parts = {}) {
  const hat = PARTS.hat.some((h) => h.id === parts.hat) ? parts.hat : 'headband';
  const uniform = PARTS.uniform.find((u) => u.id === parts.uniform) ?? PARTS.uniform[0];
  const face = PARTS.face.some((f) => f.id === parts.face) ? parts.face : parts.beard ? 'beard' : 'none';
  const skin = parts.skin ?? PARTS.skin[1];
  const goggles = parts.goggles ?? PARTS.goggles[0];
  return {
    parts: { hat, uniform: uniform.id, skin, goggles, face },
    hat,
    hatColor: HAT_COLORS[hat] ?? uniform.dark,
    skin,
    uniform: uniform.main,
    uniformDark: uniform.dark,
    pants: uniform.pants,
    camo: uniform.camo,
    goggles,
    face,
  };
}

export const DEFAULT_AVATAR = { hat: 'headband', uniform: 'woodland', skin: PARTS.skin[1], goggles: PARTS.goggles[0], face: 'none' };

export const BOT_AVATARS = [
  { hat: 'helmet', uniform: 'desert', skin: PARTS.skin[3], goggles: PARTS.goggles[0], face: 'beard' },
  { hat: 'beanie', uniform: 'arctic', skin: PARTS.skin[0], goggles: PARTS.goggles[1], face: 'none' },
  { hat: 'bandana', uniform: 'night', skin: PARTS.skin[3], goggles: PARTS.goggles[2], face: 'stubble' },
  { hat: 'beret', uniform: 'jungle', skin: PARTS.skin[2], goggles: PARTS.goggles[0], face: 'mustache' },
  { hat: 'cap', uniform: 'navy', skin: PARTS.skin[4], goggles: PARTS.goggles[3], face: 'none' },
  { hat: 'drill', uniform: 'desert', skin: PARTS.skin[5], goggles: PARTS.goggles[4], face: 'none' },
  { hat: 'none', uniform: 'woodland', skin: PARTS.skin[2], goggles: PARTS.goggles[5], face: 'beard' },
  { hat: 'headband', uniform: 'banana', skin: PARTS.skin[1], goggles: PARTS.goggles[3], face: 'stubble' },
].map(makeAvatar);

const INK = '#1d1d1d';
const STRAP = '#5a3b22';
const BOOT = '#5b3a22';
const SOLE = '#2a1c12';
const METAL = '#8d949c';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function inked(ctx, fill, width = 2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.stroke();
}

function limb(ctx, color, width, points) {
  for (const [w, c] of [[width + 3, INK], [width, color]]) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
}

function drawHat(ctx, a, hx, hy, f, time) {
  ctx.lineJoin = 'round';
  switch (a.hat) {
    case 'headband': {
      ctx.save();
      ctx.beginPath(); ctx.arc(hx, hy, 14.2, 0, Math.PI * 2); ctx.clip();
      roundRect(ctx, hx - 16, hy - 10, 32, 6, 2); inked(ctx, a.hatColor, 1.6);
      ctx.restore();
      const kx = hx - f * 13;
      const flap = Math.sin(time * 9) * 2;
      for (const [len, dy] of [[11, -1], [9, 3]]) {
        ctx.beginPath();
        ctx.moveTo(kx, hy - 8);
        ctx.quadraticCurveTo(kx - f * len * 0.6, hy - 8 + dy + flap, kx - f * len, hy - 5 + dy + flap * 1.5);
        ctx.lineTo(kx - f * (len - 2), hy - 2 + dy + flap);
        ctx.quadraticCurveTo(kx - f * len * 0.4, hy - 4 + dy, kx, hy - 5);
        ctx.closePath();
        inked(ctx, a.hatColor, 1.5);
      }
      ctx.beginPath(); ctx.arc(kx, hy - 7, 2.6, 0, Math.PI * 2); inked(ctx, a.hatColor, 1.5);
      break;
    }
    case 'none':
      break;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 16, Math.PI, 0);
      ctx.lineTo(hx + 18, hy - 2);
      ctx.lineTo(hx - 18, hy - 2);
      ctx.closePath();
      inked(ctx, a.hatColor);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy - 4, 11, 1.15 * Math.PI, 1.45 * Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(hx - 15, hy - 6, 30, 2);
      break;
    case 'beret':
      ctx.beginPath();
      ctx.ellipse(hx - f * 3, hy - 11, 17, 7, -0.2 * f, 0, Math.PI * 2);
      inked(ctx, a.hatColor);
      ctx.beginPath(); ctx.arc(hx + f * 7, hy - 12, 2.5, 0, Math.PI * 2); inked(ctx, '#f4d35e', 1);
      break;
    case 'beanie':
      ctx.beginPath(); ctx.arc(hx, hy - 5, 15, Math.PI, 0); ctx.closePath();
      inked(ctx, a.hatColor);
      roundRect(ctx, hx - 15, hy - 8, 30, 5, 2); inked(ctx, 'rgba(0,0,0,0.25)', 1.5);
      ctx.beginPath(); ctx.arc(hx, hy - 21, 4.5, 0, Math.PI * 2);
      inked(ctx, a.hatColor);
      break;
    case 'bandana':
      ctx.beginPath(); ctx.arc(hx, hy - 4, 15, Math.PI * 1.02, -0.02 * Math.PI); ctx.closePath();
      inked(ctx, a.hatColor);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const dx of [-7, 0, 7]) { ctx.beginPath(); ctx.arc(hx + dx, hy - 10, 1.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(hx - f * 13, hy - 6); ctx.lineTo(hx - f * 23, hy - 1); ctx.lineTo(hx - f * 21, hy - 10); ctx.closePath();
      inked(ctx, a.hatColor);
      break;
    case 'drill':
      ctx.beginPath(); ctx.ellipse(hx, hy - 8, 21, 4, 0, 0, Math.PI * 2);
      inked(ctx, a.hatColor);
      ctx.beginPath(); ctx.moveTo(hx - 11, hy - 9); ctx.lineTo(hx - 7, hy - 24); ctx.lineTo(hx, hy - 20); ctx.lineTo(hx + 7, hy - 24); ctx.lineTo(hx + 11, hy - 9); ctx.closePath();
      inked(ctx, a.hatColor);
      ctx.fillStyle = '#5e3c14'; ctx.fillRect(hx - 11, hy - 12, 22, 3);
      break;
    case 'cap':
      ctx.beginPath(); ctx.arc(hx, hy - 5, 15, Math.PI, 0); ctx.closePath();
      inked(ctx, a.hatColor);
      roundRect(ctx, f > 0 ? hx : hx - 19, hy - 7, 19, 4, 2);
      inked(ctx, a.hatColor, 1.5);
      break;
  }
}

function drawGun(ctx, weaponKey) {
  switch (weaponKey) {
    case 'smg':
      roundRect(ctx, 1, -3, 7, 6, 2); inked(ctx, '#3a3f3a', 1.5);
      roundRect(ctx, 6, -4, 16, 8, 2); inked(ctx, '#3a4a3a', 1.5);
      ctx.fillStyle = INK; ctx.fillRect(22, -1.5, 7, 3);
      roundRect(ctx, 13, 3, 4, 9, 1); inked(ctx, '#222', 1);
      return [19, 2];
    case 'rifle':
      ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(6, -3); ctx.lineTo(6, 4); ctx.lineTo(-3, 6); ctx.closePath();
      inked(ctx, '#6b4a2b', 1.5);
      roundRect(ctx, 5, -4, 15, 8, 2); inked(ctx, '#3d3f45', 1.5);
      roundRect(ctx, 19, -3, 10, 6, 2); inked(ctx, '#6b4a2b', 1.5);
      ctx.fillStyle = INK; ctx.fillRect(29, -1.5, 9, 3);
      ctx.fillRect(34, -4.5, 2, 3);
      roundRect(ctx, 9, -7, 8, 3, 1); inked(ctx, '#2b2b2b', 1);
      ctx.beginPath(); ctx.moveTo(13, 4); ctx.quadraticCurveTo(14, 10, 18, 12); ctx.lineTo(21, 10); ctx.quadraticCurveTo(18, 8, 18, 4); ctx.closePath();
      inked(ctx, '#2a2a2a', 1);
      return [23, 3];
    case 'shotgun':
      ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(7, -3); ctx.lineTo(7, 4); ctx.lineTo(-3, 6); ctx.closePath();
      inked(ctx, '#5a3e2b', 1.5);
      roundRect(ctx, 6, -4, 12, 7, 2); inked(ctx, '#3d3f45', 1.5);
      roundRect(ctx, 17, -3, 18, 3, 1); inked(ctx, '#2b2b2b', 1);
      roundRect(ctx, 18, 0, 10, 4, 1.5); inked(ctx, '#7a5638', 1);
      return [23, 2];
    case 'sniper':
      ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(7, -3); ctx.lineTo(7, 4); ctx.lineTo(-4, 6); ctx.closePath();
      inked(ctx, '#3a3f2a', 1.5);
      roundRect(ctx, 6, -3.5, 18, 7, 2); inked(ctx, '#2b2b33', 1.5);
      ctx.fillStyle = INK; ctx.fillRect(24, -1.2, 22, 2.4);
      roundRect(ctx, 11, -9, 14, 5, 2.5); inked(ctx, '#111', 1.2);
      ctx.fillStyle = '#4cc9f0'; ctx.fillRect(23.5, -8, 1.5, 3);
      return [20, 3];
    case 'rocket':
      roundRect(ctx, -6, -6, 40, 11, 4); inked(ctx, '#4a5d23', 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-6, -1, 40, 2);
      ctx.beginPath(); ctx.moveTo(34, -5); ctx.lineTo(40, -1); ctx.lineTo(34, 4); ctx.closePath(); inked(ctx, '#c0392b', 1.2);
      roundRect(ctx, 6, 4, 4, 6, 1); inked(ctx, '#222', 1);
      return [18, 5];
    case 'flamer':
      roundRect(ctx, 0, -4, 24, 8, 3); inked(ctx, '#a33b20', 1.5);
      ctx.fillStyle = INK; ctx.fillRect(24, -2, 10, 4);
      ctx.beginPath(); ctx.arc(14, 9, 5, 0, Math.PI * 2); inked(ctx, '#e8a33d', 1.2);
      ctx.fillStyle = '#ff9f1c'; ctx.beginPath(); ctx.arc(35, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      return [20, 3];
    default:
      roundRect(ctx, 4, -4, 10, 7, 2); inked(ctx, '#8a8f98', 1.5);
      ctx.beginPath(); ctx.arc(9, 0, 3, 0, Math.PI * 2); inked(ctx, '#6b7078', 1);
      ctx.fillStyle = INK; ctx.fillRect(14, -1.5, 8, 3);
      roundRect(ctx, 4, 2, 4, 6, 1.5); inked(ctx, '#5a3e2b', 1);
      return null;
  }
}

function swingAngle(t) {
  if (t < 0.3) return -1.3 * (t / 0.3);
  if (t < 0.55) return -1.3 + 2.2 * ((t - 0.3) / 0.25);
  return 0.9 * (1 - (t - 0.55) / 0.45);
}

const flashAvatars = new WeakMap();
function flashAvatar(avatar) {
  let white = flashAvatars.get(avatar);
  if (!white) {
    white = Object.fromEntries(Object.entries(avatar).map(([k, v]) => [k, typeof v === 'string' && (v.startsWith('#') || v.startsWith('rgb')) ? '#ffffff' : v]));
    flashAvatars.set(avatar, white);
  }
  return white;
}

export function drawSoldier(ctx, s, avatar, time) {
  drawSoldierBody(ctx, s, avatar, time);
  const flash = Math.min(1, s.hitFlash || 0);
  if (flash <= 0) return;
  ctx.save();
  ctx.globalAlpha *= 0.85 * flash;
  drawSoldierBody(ctx, { ...s, hurtFlash: 0, shielded: false, jetting: false, swing: 0 }, flashAvatar(avatar), time);
  ctx.restore();
}

function drawSoldierBody(ctx, s, avatar, time) {
  const cx = s.x + s.w / 2;
  const top = s.y;
  const feet = s.y + s.h;
  const f = s.facing;
  const hurt = s.hurtFlash > 0;
  const jacket = hurt ? '#ff6b6b' : avatar.uniform;
  const vest = avatar.uniformDark;
  const pants = avatar.pants ?? avatar.uniformDark;
  const camo = avatar.camo ?? 'rgba(0,0,0,0.2)';

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const lean = s.lean || 0;
  const squash = s.squash || 0;
  if (lean || squash) {
    ctx.translate(cx, feet);
    if (lean) ctx.rotate(lean);
    if (squash) ctx.scale(1 + squash * 0.6, 1 - squash);
    ctx.translate(-cx, -feet);
  }
  if (s.shielded) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 20);

  const jx = cx - f * 12;
  if (s.jetting) {
    const fl = 16 + Math.random() * 10;
    const grad = ctx.createLinearGradient(jx, top + 41, jx, top + 41 + fl);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(0.4, '#ff9f1c');
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(jx - 5, top + 41);
    ctx.quadraticCurveTo(jx, top + 41 + fl * 1.1, jx + 5, top + 41);
    ctx.fill();
  }

  roundRect(ctx, jx - 6.5, top + 18, 13, 22, 5); inked(ctx, METAL);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(jx - f * 3 - 1, top + 21, 2, 15);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(jx - 6, top + 28, 12, 3);
  roundRect(ctx, jx - 4, top + 15, 8, 4, 1.5); inked(ctx, '#6b7078', 1.5);
  roundRect(ctx, jx - 4, top + 38, 8, 4, 1); inked(ctx, '#55595f', 1.5);

  const walk = s.onGround ? s.walkPhase : 0;
  for (const [dx, phase] of [[-4, 0], [4, Math.PI]]) {
    const sw = s.onGround ? Math.sin(walk + phase) * 6 : (phase ? -2 : 3);
    const lift = s.onGround ? Math.max(0, Math.cos(walk + phase)) * 3 : 3;
    const hip = [cx + dx, top + 36];
    const knee = [cx + dx + sw * 0.6 + f * 1.5, top + 42 - lift];
    const ankle = [cx + dx + sw, feet - 5 - lift * 0.6];
    limb(ctx, pants, 6, [hip, knee, ankle]);
    ctx.fillStyle = camo;
    ctx.beginPath(); ctx.arc(knee[0] - 0.5, knee[1] - 2, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc((knee[0] + ankle[0]) / 2 + 0.5, (knee[1] + ankle[1]) / 2, 1.3, 0, Math.PI * 2); ctx.fill();
    roundRect(ctx, ankle[0] - 4.5 + f * 1.5, ankle[1] - 1, 10, 6, 2.5); inked(ctx, BOOT, 1.5);
    ctx.fillStyle = SOLE; ctx.fillRect(ankle[0] - 4 + f * 1.5, ankle[1] + 3.2, 9, 1.6);
  }

  roundRect(ctx, cx - 9.5, top + 18, 19, 21, 6); inked(ctx, jacket);
  roundRect(ctx, cx - 7, top + 25, 14, 9, 2); inked(ctx, vest, 1.3);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(cx - 5.5, top + 27, 4.5, 4); ctx.fillRect(cx + 1, top + 27, 4.5, 4);
  ctx.strokeStyle = STRAP; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - f * 9, top + 20); ctx.lineTo(cx + f * 5, top + 34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 6, top + 18.5); ctx.lineTo(cx, top + 22); ctx.lineTo(cx + 6, top + 18.5);
  ctx.strokeStyle = vest; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.fillStyle = '#3b2a1a'; ctx.fillRect(cx - 9.5, top + 34, 19, 3);
  ctx.fillStyle = '#c9a227'; ctx.fillRect(cx - 2, top + 34, 4, 3);

  const hx = cx + f;
  const hy = top + 9;
  ctx.beginPath(); ctx.arc(hx, hy, 14.5, 0, Math.PI * 2); inked(ctx, avatar.skin);
  const ear = () => {
    ctx.beginPath(); ctx.arc(hx - f * 10.5, hy + 4, 3.4, 0, Math.PI * 2); inked(ctx, avatar.skin, 1.6);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hx - f * 10.5, hy + 4, 1.6, 0.5 * Math.PI, 1.5 * Math.PI, f < 0); ctx.stroke();
  };
  if (HAIRLESS.has(avatar.hat)) {
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(hx - f * 3, hy - 9, 5, 2.4, -0.3 * f, 0, Math.PI * 2); ctx.fill();
  }

  if (avatar.face === 'beard') {
    ctx.fillStyle = 'rgba(70,45,25,0.85)';
    ctx.beginPath(); ctx.arc(hx + f * 2, hy + 3, 12, 0.08 * Math.PI, 0.92 * Math.PI); ctx.fill();
  } else if (avatar.face === 'stubble') {
    ctx.fillStyle = 'rgba(60,45,35,0.28)';
    ctx.beginPath(); ctx.arc(hx + f * 2, hy + 4, 11, 0.12 * Math.PI, 0.88 * Math.PI); ctx.fill();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(hx + f * 2, hy + 10); ctx.quadraticCurveTo(hx + f * 5.5, hy + 8.8, hx + f * 9, hy + 10); ctx.stroke();
  if (avatar.face === 'mustache') {
    ctx.fillStyle = '#4a2f1b';
    ctx.beginPath(); ctx.ellipse(hx + f * 5.5, hy + 7.5, 5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  }

  ctx.save();
  ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = STRAP; ctx.fillRect(hx - 16, hy - 1, 32, 4);
  ctx.restore();
  ear();
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx + f * -1, hy - 6.5); ctx.lineTo(hx + f * 13, hy - 4.5); ctx.stroke();
  ctx.strokeStyle = '#3b3530'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hx + f * 5, hy + 1); ctx.lineTo(hx + f * 7, hy + 1); ctx.stroke();
  for (const lx of [hx + f * 1, hx + f * 11]) {
    ctx.beginPath(); ctx.arc(lx, hy + 1, 5.8, 0, Math.PI * 2);
    inked(ctx, '#3b3530', 2);
    ctx.beginPath(); ctx.arc(lx, hy + 1, 3.9, 0, Math.PI * 2);
    ctx.fillStyle = avatar.goggles; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(lx - 1.4, hy - 0.6, 1.3, 0, Math.PI * 2); ctx.fill();
  }
  drawHat(ctx, avatar, hx, hy, f, time);

  ctx.save();
  ctx.translate(cx, top + 25);
  ctx.rotate(s.aim);
  if (Math.cos(s.aim) < 0) ctx.scale(1, -1);
  const swing = s.swing || 0;
  if (swing > 0 && swing < 1) {
    const now = swingAngle(swing);
    if (swing > 0.28 && swing < 0.7) {
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - Math.abs(swing - 0.45) / 0.25)})`;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 36, -1.3, Math.max(-1.3, now)); ctx.stroke();
    }
    ctx.rotate(now);
    ctx.translate(Math.sin(swing * Math.PI) * 6, 0);
  }
  if (s.gunTilt) ctx.rotate(s.gunTilt);
  if (s.recoil) ctx.translate(-s.recoil, 0);
  limb(ctx, jacket, 5, [[0, 0], [9, 1]]);
  const fore = drawGun(ctx, s.weapon);
  if (fore) {
    limb(ctx, jacket, 4.5, [[-1, -2], [fore[0] - 2, fore[1] + 1]]);
    ctx.beginPath(); ctx.arc(fore[0], fore[1] + 1, 3, 0, Math.PI * 2); inked(ctx, avatar.skin, 1.5);
  }
  ctx.beginPath(); ctx.arc(9.5, 1.5, 3.2, 0, Math.PI * 2); inked(ctx, avatar.skin, 1.5);
  ctx.restore();

  const thr = s.throwArm || 0;
  if (thr > 0 && thr < 1) {
    const ang = thr < 0.35 ? -1.7 - 0.9 * (thr / 0.35) : -2.6 + 3.0 * ((thr - 0.35) / 0.65);
    const sx = cx - f * 2;
    const sy = top + 23;
    const hxEnd = sx + Math.cos(ang) * 18 * f;
    const hyEnd = sy + Math.sin(ang) * 18;
    limb(ctx, jacket, 4.5, [[sx, sy], [hxEnd, hyEnd]]);
    if (thr < 0.5) { ctx.beginPath(); ctx.arc(hxEnd + Math.cos(ang) * 3 * f, hyEnd + Math.sin(ang) * 3, 4, 0, Math.PI * 2); inked(ctx, '#2d4a22', 1.5); }
    ctx.beginPath(); ctx.arc(hxEnd, hyEnd, 3.2, 0, Math.PI * 2); inked(ctx, avatar.skin, 1.5);
  }

  ctx.restore();
}

const GUN_SPAN = { magnum: [4, 22], smg: [1, 29], rifle: [-3, 38], shotgun: [-3, 35], sniper: [-4, 46], rocket: [-6, 40], flamer: [0, 36] };

export function drawWeaponPickup(ctx, weaponKey, x, y, { scale = 1.25, angle = 0 } = {}) {
  const [from, to] = GUN_SPAN[weaponKey] ?? GUN_SPAN.magnum;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.translate(-(from + to) / 2, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  drawGun(ctx, weaponKey);
  ctx.restore();
}

export function drawAvatarPreview(canvas, avatar, time = 0) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / 60, canvas.height / 80);
  drawSoldier(ctx, { x: 16, y: 18, w: 28, h: 50, facing: 1, aim: 0.12, walkPhase: 0, onGround: true, jetting: false, weapon: 'rifle', hurtFlash: 0 }, avatar, time);
  ctx.restore();
}
