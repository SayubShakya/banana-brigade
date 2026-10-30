// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { WEAPONS, SIDEARM } from './config.js';
import { raycast } from './map.js';

export const AUTO_FIRE_SLACK = 10;

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
