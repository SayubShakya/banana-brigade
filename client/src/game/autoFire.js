// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { WEAPONS, SIDEARM, DIFFICULTY } from './config.js';
import { raycast } from './map.js';

export const AUTO_FIRE_SLACK = 10;
export const AIM_ASSIST = { maxBend: (3 * Math.PI) / 180, cone: (12 * Math.PI) / 180 };

const activeGunKey = (s) => (s.current === 'primary' && s.primary ? s.primary.key : s.sidearm?.key ?? SIDEARM);

export function isAimedAtEnemy(player, world) {
  if (!player?.alive || !world?.map) return false;
  const range = WEAPONS[activeGunKey(player)]?.range ?? 0;
  const sx = player.x + player.w / 2;
  const sy = player.y + 25;
  const ax = player.controls.aimX - sx;
  const ay = player.controls.aimY - sy;
  const len = Math.hypot(ax, ay);
  if (len < 1) return false;
  const ux = ax / len;
  const uy = ay / len;

  for (const e of world.soldiers) {
    if (e === player || !e.alive || e.team === player.team) continue;
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const dx = ex - sx;
    const dy = ey - sy;
    const along = dx * ux + dy * uy;
    if (along <= 0 || along > range) continue;
    const off = Math.abs(dx * uy - dy * ux);
    if (off > e.h / 2 + AUTO_FIRE_SLACK) continue;
    if (raycast(world.map, sx, sy, ex, ey, 8)) continue;
    return true;
  }
  return false;
}

export const aimAssistOn = (world, shooter) => !!world && !!shooter?.isPlayer && world.player === shooter && world.mode !== 'online'
  && world.difficulty?.name === DIFFICULTY.easy.name;

export function assistAim(world, shooter, aim) {
  if (!aimAssistOn(world, shooter) || !shooter.alive || !world.map) return aim;
  const range = WEAPONS[activeGunKey(shooter)]?.range ?? 0;
  const sx = shooter.x + shooter.w / 2;
  const sy = shooter.y + 25;
  const angle = Math.atan2(aim.y - sy, aim.x - sx);
  let best = null;
  for (const e of world.soldiers) {
    if (e === shooter || !e.alive || e.team === shooter.team) continue;
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const d = Math.hypot(ex - sx, ey - sy);
    if (d > range || d < 1) continue;
    const turn = Math.atan2(ey - sy, ex - sx) - angle;
    const off = Math.atan2(Math.sin(turn), Math.cos(turn));
    if (Math.abs(off) > AIM_ASSIST.cone) continue;
    if (raycast(world.map, sx, sy, ex, ey, 8)) continue;
    if (!best || d < best.d) best = { d, off };
  }
  if (!best) return aim;
  const bent = angle + Math.sign(best.off) * Math.min(Math.abs(best.off), AIM_ASSIST.maxBend);
  const len = Math.hypot(aim.x - sx, aim.y - sy);
  return { x: sx + Math.cos(bent) * len, y: sy + Math.sin(bent) * len };
}
