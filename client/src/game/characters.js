// Soldier avatars and how they are drawn: big round head, helmet, goggles, small body,
// jetpack on the back and an arm that follows the aim. An avatar is built from parts
// (headgear, skin, uniform, goggles, beard); add options to PARTS to give players more choice.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

export const PARTS = {
  hat: [
    { id: 'helmet', name: 'Helmet' }, { id: 'beret', name: 'Beret' }, { id: 'beanie', name: 'Beanie' },
    { id: 'cap', name: 'Cap' }, { id: 'bandana', name: 'Bandana' }, { id: 'drill', name: 'Drill hat' },
  ],
  skin: ['#ffdbb4', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'],
  uniform: [
    { id: 'jungle', name: 'Jungle', main: '#4f7a3a', dark: '#36572a' },
    { id: 'desert', name: 'Desert', main: '#c8a165', dark: '#9c7a45' },
    { id: 'arctic', name: 'Arctic', main: '#dfe7ee', dark: '#a9b6c2' },
    { id: 'night',  name: 'Night',  main: '#33333d', dark: '#1e1e26' },
    { id: 'navy',   name: 'Navy',   main: '#2c4a7a', dark: '#1d3253' },
    { id: 'banana', name: 'Banana', main: '#f2c230', dark: '#b8901c' },
  ],
  goggles: ['#2b2b2b', '#2e86c1', '#00f5d4', '#f4d35e', '#e63946', '#8e44ad'],
};

const HAT_COLORS = { beret: '#c0392b', drill: '#b08850', bandana: '#7b2cbf' };

// Turns a choice of parts into everything drawSoldier needs.
export function makeAvatar(parts = {}) {
  const hat = PARTS.hat.some((h) => h.id === parts.hat) ? parts.hat : 'helmet';
  const uniform = PARTS.uniform.find((u) => u.id === parts.uniform) ?? PARTS.uniform[0];
  return {
    parts: { hat, uniform: uniform.id, skin: parts.skin ?? PARTS.skin[1], goggles: parts.goggles ?? PARTS.goggles[0], beard: !!parts.beard },
    hat,
    hatColor: HAT_COLORS[hat] ?? uniform.dark,
    skin: parts.skin ?? PARTS.skin[1],
    uniform: uniform.main,
    uniformDark: uniform.dark,
    goggles: parts.goggles ?? PARTS.goggles[0],
    beard: !!parts.beard,
  };
}

export const DEFAULT_AVATAR = { hat: 'helmet', uniform: 'jungle', skin: PARTS.skin[1], goggles: PARTS.goggles[0], beard: false };

// Looks for the computer-controlled soldiers.
export const BOT_AVATARS = [
  { hat: 'helmet', uniform: 'desert', skin: PARTS.skin[3], goggles: PARTS.goggles[0], beard: true },
  { hat: 'beanie', uniform: 'arctic', skin: PARTS.skin[0], goggles: PARTS.goggles[1], beard: false },
  { hat: 'bandana', uniform: 'night', skin: PARTS.skin[3], goggles: PARTS.goggles[2], beard: false },
  { hat: 'beret', uniform: 'jungle', skin: PARTS.skin[2], goggles: PARTS.goggles[0], beard: true },
  { hat: 'cap', uniform: 'navy', skin: PARTS.skin[4], goggles: PARTS.goggles[3], beard: false },
  { hat: 'drill', uniform: 'desert', skin: PARTS.skin[5], goggles: PARTS.goggles[4], beard: false },
].map(makeAvatar);

const GUN_SHAPES = {
  magnum:  { len: 18, h: 6,  color: '#8a8f98' },
  smg:     { len: 26, h: 7,  color: '#2f3b2f' },
  rifle:   { len: 34, h: 7,  color: '#4b3621' },
  flamer:  { len: 34, h: 10, color: '#a33b20' },
  shotgun: { len: 32, h: 7,  color: '#5a3e2b' },
  sniper:  { len: 42, h: 5,  color: '#2b2b33' },
  rocket:  { len: 38, h: 11, color: '#4a5d23' },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHat(ctx, a, hx, hy) {
  ctx.fillStyle = a.hatColor;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  switch (a.hat) {
    case 'helmet':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, 14, Math.PI, 0);
      ctx.lineTo(hx + 16, hy + 1);
      ctx.lineTo(hx - 16, hy + 1);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      break;
    case 'beret':
      ctx.beginPath();
      ctx.ellipse(hx - 3, hy - 8, 15, 7, -0.2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      break;
    case 'beanie':
      ctx.beginPath();
      ctx.arc(hx, hy - 2, 13, Math.PI, 0);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy - 16, 4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bandana':
      ctx.fillRect(hx - 13, hy - 9, 26, 6);
      ctx.beginPath(); ctx.moveTo(hx - 12, hy - 6); ctx.lineTo(hx - 21, hy - 2); ctx.lineTo(hx - 19, hy - 9); ctx.fill();
      break;
    case 'drill':
      ctx.beginPath(); ctx.ellipse(hx, hy - 6, 19, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hx - 10, hy - 7); ctx.lineTo(hx - 6, hy - 21); ctx.lineTo(hx, hy - 17); ctx.lineTo(hx + 6, hy - 21); ctx.lineTo(hx + 10, hy - 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5e3c14'; ctx.fillRect(hx - 10, hy - 10, 20, 3);
      break;
    case 'cap':
      ctx.beginPath(); ctx.arc(hx, hy - 3, 13, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillRect(hx, hy - 5, 17, 4);
      break;
  }
}

function drawGun(ctx, weaponKey) {
  const g = GUN_SHAPES[weaponKey] ?? GUN_SHAPES.magnum;
  ctx.fillStyle = g.color;
  ctx.fillRect(4, -g.h / 2, g.len, g.h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(6, g.h / 2 - 1, 5, 5); // grip
  if (weaponKey === 'sniper') { ctx.fillStyle = '#111'; ctx.fillRect(14, -g.h / 2 - 4, 12, 4); }
  if (weaponKey === 'flamer') { ctx.fillStyle = '#555'; ctx.fillRect(10, g.h / 2, 8, 6); }
  if (weaponKey === 'rocket') { ctx.fillStyle = '#c0392b'; ctx.fillRect(4 + g.len - 4, -g.h / 2, 4, g.h); }
}

// s: { x, y, w, h, facing, aim, walkPhase, onGround, jetting, weapon, hurtFlash, shielded }
export function drawSoldier(ctx, s, avatar, time) {
  const cx = s.x + s.w / 2;
  const top = s.y;
  const feet = s.y + s.h;
  const f = s.facing;

  ctx.save();
  if (s.shielded) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 20);

  // Jetpack flames.
  if (s.jetting) {
    const fl = 14 + Math.random() * 10;
    const jx = cx - f * 11;
    const grad = ctx.createLinearGradient(jx, feet - 18, jx, feet - 18 + fl);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(0.4, '#ff9f1c');
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(jx - 5, feet - 18);
    ctx.lineTo(jx + 5, feet - 18);
    ctx.lineTo(jx, feet - 18 + fl);
    ctx.fill();
  }

  // Jetpack.
  ctx.fillStyle = '#6b6b6b';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - f * 11 - 5, top + 20, 10, 20, 3);
  ctx.fill(); ctx.stroke();

  // Legs (swing while walking, tucked while flying).
  const swing = s.onGround ? Math.sin(s.walkPhase) * 7 : 3;
  ctx.strokeStyle = avatar.uniformDark;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 3, top + 37); ctx.lineTo(cx - 3 + swing, feet - 3);
  ctx.moveTo(cx + 3, top + 37); ctx.lineTo(cx + 3 - swing, feet - 3);
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.fillRect(cx - 6 + swing, feet - 4, 8 * (f > 0 ? 1 : 1), 4);
  ctx.fillRect(cx - 2 - swing, feet - 4, 8, 4);

  // Body.
  ctx.fillStyle = s.hurtFlash > 0 ? '#ff6b6b' : avatar.uniform;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - 8, top + 19, 16, 20, 4);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = avatar.uniformDark;
  ctx.fillRect(cx - 8, top + 31, 16, 3); // belt

  // Head.
  const hx = cx;
  const hy = top + 11;
  ctx.fillStyle = avatar.skin;
  ctx.beginPath(); ctx.arc(hx, hy, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (avatar.beard) {
    ctx.fillStyle = 'rgba(60,40,20,0.65)';
    ctx.beginPath(); ctx.arc(hx + f * 2, hy + 4, 8, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill();
  }
  // Goggles facing the aim side.
  ctx.fillStyle = avatar.goggles;
  roundRect(ctx, hx + f * 2 - 7, hy - 4, 14, 6, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(hx + f * 2 + (f > 0 ? 2 : -5), hy - 3, 3, 2);
  drawHat(ctx, avatar, hx, hy);

  // Arm + gun, rotated to the aim angle around the shoulder.
  ctx.save();
  ctx.translate(cx, top + 25);
  ctx.rotate(s.aim);
  if (Math.cos(s.aim) < 0) ctx.scale(1, -1);
  ctx.strokeStyle = avatar.uniform;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
  drawGun(ctx, s.weapon);
  ctx.fillStyle = avatar.skin;
  ctx.beginPath(); ctx.arc(10, 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.restore();
}

// Small standalone preview used on the character select screen.
export function drawAvatarPreview(canvas, avatar, time = 0) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / 60, canvas.height / 80);
  drawSoldier(ctx, { x: 16, y: 18, w: 28, h: 50, facing: 1, aim: -0.15, walkPhase: 0, onGround: true, jetting: false, weapon: 'rifle', hurtFlash: 0 }, avatar, time);
  ctx.restore();
}
