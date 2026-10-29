// Soldier avatars and how they are drawn, in the trailer's chibi style: big round head,
// headgear, round goggles on a strap, thick outlines, small body, jetpack on the back
// and an arm that follows the aim. An avatar is built from parts (headgear, skin,
// uniform, goggles, beard); add options to PARTS to give players more choice.
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
  smg:     { len: 26, h: 7,  color: '#3a4a3a' },
  rifle:   { len: 34, h: 7,  color: '#3d3f45' },
  flamer:  { len: 34, h: 10, color: '#a33b20' },
  shotgun: { len: 32, h: 7,  color: '#5a3e2b' },
  sniper:  { len: 42, h: 5,  color: '#2b2b33' },
  rocket:  { len: 38, h: 11, color: '#4a5d23' },
};

const INK = '#1d1d1d';           // the thick cartoon outline used on every part
const STRAP = '#5a3b22';         // goggle strap

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Fills the current path and gives it the dark cartoon outline.
function inked(ctx, fill, width = 2) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawHat(ctx, a, hx, hy) {
  ctx.lineJoin = 'round';
  switch (a.hat) {
    case 'helmet':
      ctx.beginPath();
      ctx.arc(hx, hy - 4, 15, Math.PI, 0);
      ctx.lineTo(hx + 17, hy - 3);
      ctx.lineTo(hx - 17, hy - 3);
      ctx.closePath();
      inked(ctx, a.hatColor);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hx, hy - 4, 10, 1.15 * Math.PI, 1.45 * Math.PI); ctx.stroke();
      break;
    case 'beret':
      ctx.beginPath();
      ctx.ellipse(hx - 3, hy - 10, 16, 7, -0.2, 0, Math.PI * 2);
      inked(ctx, a.hatColor);
      break;
    case 'beanie':
      ctx.beginPath(); ctx.arc(hx, hy - 5, 14, Math.PI, 0); ctx.closePath();
      inked(ctx, a.hatColor);
      ctx.beginPath(); ctx.arc(hx, hy - 20, 4.5, 0, Math.PI * 2);
      inked(ctx, a.hatColor);
      break;
    case 'bandana':
      roundRect(ctx, hx - 14, hy - 12, 28, 6, 2);
      inked(ctx, a.hatColor);
      ctx.beginPath(); ctx.moveTo(hx - 13, hy - 9); ctx.lineTo(hx - 23, hy - 4); ctx.lineTo(hx - 21, hy - 12); ctx.closePath();
      inked(ctx, a.hatColor);
      break;
    case 'drill':
      ctx.beginPath(); ctx.ellipse(hx, hy - 8, 20, 4, 0, 0, Math.PI * 2);
      inked(ctx, a.hatColor);
      ctx.beginPath(); ctx.moveTo(hx - 11, hy - 9); ctx.lineTo(hx - 7, hy - 23); ctx.lineTo(hx, hy - 19); ctx.lineTo(hx + 7, hy - 23); ctx.lineTo(hx + 11, hy - 9); ctx.closePath();
      inked(ctx, a.hatColor);
      ctx.fillStyle = '#5e3c14'; ctx.fillRect(hx - 11, hy - 12, 22, 3);
      break;
    case 'cap':
      ctx.beginPath(); ctx.arc(hx, hy - 5, 14, Math.PI, 0); ctx.closePath();
      inked(ctx, a.hatColor);
      roundRect(ctx, hx, hy - 7, 18, 4, 2);
      inked(ctx, a.hatColor, 1.5);
      break;
  }
}

// A cartoon gun: body, stock, magazine and barrel, all outlined.
function drawGun(ctx, weaponKey) {
  const g = GUN_SHAPES[weaponKey] ?? GUN_SHAPES.magnum;
  const long = g.len > 24;
  if (long) { roundRect(ctx, -2, -g.h / 2 + 1, 8, g.h + 1, 2); inked(ctx, '#6b4a2b', 1.5); }      // stock
  roundRect(ctx, 4, -g.h / 2, g.len * 0.7, g.h, 2); inked(ctx, g.color, 1.5);                    // body
  ctx.fillStyle = INK; ctx.fillRect(4 + g.len * 0.7, -1.5, g.len * 0.3, 3);                       // barrel
  roundRect(ctx, 8, g.h / 2 - 1, 4, 6, 1); inked(ctx, '#2a2a2a', 1);                              // grip
  if (long) { roundRect(ctx, 4 + g.len * 0.4, g.h / 2 - 1, 4, 7, 1); inked(ctx, '#2a2a2a', 1); } // magazine
  if (weaponKey === 'sniper') { roundRect(ctx, 14, -g.h / 2 - 5, 13, 4, 2); inked(ctx, '#111', 1); }
  if (weaponKey === 'flamer') { ctx.beginPath(); ctx.arc(16, g.h / 2 + 4, 4, 0, Math.PI * 2); inked(ctx, '#e8a33d', 1); }
  if (weaponKey === 'rocket') { ctx.fillStyle = '#c0392b'; ctx.fillRect(4 + g.len * 0.7 - 4, -g.h / 2, 4, g.h); }
}

// s: { x, y, w, h, facing, aim, walkPhase, onGround, jetting, weapon, hurtFlash, shielded, recoil? }
// Drawn in the same chibi style as the trailer: big round head, round goggles on a strap,
// thick dark outlines, a chunky jetpack and boots.
export function drawSoldier(ctx, s, avatar, time) {
  const cx = s.x + s.w / 2;
  const top = s.y;
  const feet = s.y + s.h;
  const f = s.facing;
  const body = s.hurtFlash > 0 ? '#ff6b6b' : avatar.uniform;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (s.shielded) ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 20);

  // Jetpack flames.
  const jx = cx - f * 12;
  if (s.jetting) {
    const fl = 16 + Math.random() * 10;
    const grad = ctx.createLinearGradient(jx, top + 40, jx, top + 40 + fl);
    grad.addColorStop(0, '#fff3b0');
    grad.addColorStop(0.4, '#ff9f1c');
    grad.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(jx - 5, top + 40);
    ctx.quadraticCurveTo(jx, top + 40 + fl * 1.1, jx + 5, top + 40);
    ctx.fill();
  }

  // Jetpack: grey tank with a light stripe and a nozzle.
  roundRect(ctx, jx - 6, top + 19, 12, 21, 4); inked(ctx, '#8d949c');
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(jx - 3, top + 22, 2, 14);
  roundRect(ctx, jx - 4, top + 38, 8, 4, 1); inked(ctx, '#55595f', 1.5);

  // Legs (swing while walking, tucked while flying) and boots.
  const swing = s.onGround ? Math.sin(s.walkPhase) * 6 : 3;
  for (const [dx, sw] of [[-4, swing], [4, -swing]]) {
    ctx.strokeStyle = INK; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(cx + dx, top + 36); ctx.lineTo(cx + dx + sw, feet - 4); ctx.stroke();
    ctx.strokeStyle = avatar.uniformDark; ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(cx + dx, top + 36); ctx.lineTo(cx + dx + sw, feet - 4); ctx.stroke();
    roundRect(ctx, cx + dx + sw - 4 + f * 1.5, feet - 6, 9, 6, 2.5); inked(ctx, '#2b2b2b', 1.5);
  }

  // Body: rounded uniform with a chest strap, a pocket and a belt.
  roundRect(ctx, cx - 9, top + 19, 18, 20, 6); inked(ctx, body);
  ctx.strokeStyle = avatar.uniformDark; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx - f * 8, top + 21); ctx.lineTo(cx + f * 6, top + 33); ctx.stroke();
  ctx.fillStyle = avatar.uniformDark; ctx.fillRect(cx - 9, top + 32, 18, 3);
  ctx.fillStyle = '#c9a227'; ctx.fillRect(cx - 2, top + 32, 4, 3); // buckle

  // Head: big round chibi head.
  const hx = cx + f;
  const hy = top + 9;
  ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI * 2); inked(ctx, avatar.skin);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(hx - f * 4, hy - 5, 5, 0, Math.PI * 2); ctx.fill();
  if (avatar.beard) {
    ctx.fillStyle = 'rgba(60,40,20,0.65)';
    ctx.beginPath(); ctx.arc(hx + f * 3, hy + 4, 8, 0.1 * Math.PI, 0.9 * Math.PI); ctx.fill();
  }
  // Small mouth under the goggles.
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hx + f * 3, hy + 9); ctx.lineTo(hx + f * 8, hy + 8.5); ctx.stroke();

  // Goggles: a strap round the head and two round lenses facing the aim side.
  ctx.save();
  ctx.beginPath(); ctx.arc(hx, hy, 13, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = STRAP; ctx.fillRect(hx - 15, hy - 1, 30, 4);
  ctx.restore();
  for (const lx of [hx + f * 1, hx + f * 10]) {
    ctx.beginPath(); ctx.arc(lx, hy + 1, 5, 0, Math.PI * 2);
    inked(ctx, '#4a4f55', 2);
    ctx.beginPath(); ctx.arc(lx, hy + 1, 3.3, 0, Math.PI * 2);
    ctx.fillStyle = avatar.goggles; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(lx - 1.2, hy - 0.4, 1.1, 0, Math.PI * 2); ctx.fill();
  }
  drawHat(ctx, avatar, hx, hy);

  // Arm + gun, rotated to the aim angle around the shoulder.
  ctx.save();
  ctx.translate(cx, top + 25);
  ctx.rotate(s.aim);
  if (Math.cos(s.aim) < 0) ctx.scale(1, -1);
  if (s.recoil) ctx.translate(-s.recoil, 0);   // the gun kicks back after a shot
  ctx.strokeStyle = INK; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
  ctx.strokeStyle = body; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
  drawGun(ctx, s.weapon);
  ctx.beginPath(); ctx.arc(10, 1, 3.2, 0, Math.PI * 2); inked(ctx, avatar.skin, 1.5);
  ctx.restore();

  ctx.restore();
}

// Small standalone preview used on the character select screen.
export function drawAvatarPreview(canvas, avatar, time = 0) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / 60, canvas.height / 80);
  drawSoldier(ctx, { x: 16, y: 18, w: 28, h: 50, facing: 1, aim: 0.12, walkPhase: 0, onGround: true, jetting: false, weapon: 'rifle', hurtFlash: 0 }, avatar, time);
  ctx.restore();
}
