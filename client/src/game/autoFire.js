// Auto-fire and aim assist helpers for the local player.
// isAimedAtEnemy() tells the game when the crosshair is on an enemy (used by auto-fire),
// assistAim() gently bends the aim towards a nearby enemy on Easy difficulty.
import { WEAPONS, SIDEARM, DIFFICULTY } from './config.js';
import { raycast } from './map.js';

// Extra pixels around an enemy's body that still count as "on target" for auto-fire.
export const AUTO_FIRE_SLACK = 10;
// Aim assist settings: bend the aim by at most 3 degrees, and only for enemies within a 12 degree cone.
export const AIM_ASSIST = { maxBend: (3 * Math.PI) / 180, cone: (12 * Math.PI) / 180 };

// Returns the key of the gun the soldier is holding right now (primary gun or sidearm).
const activeGunKey = (s) => (s.current === 'primary' && s.primary ? s.primary.key : s.sidearm?.key ?? SIDEARM);

/**
 * Checks whether the player's aim line currently points at a visible enemy in weapon range.
 * @param {object} player the soldier doing the aiming (uses controls.aimX / aimY)
 * @param {object} world the game world (soldiers + map)
 * @returns {boolean} true if an enemy is under the aim line and not hidden behind a wall
 */
export function isAimedAtEnemy(player, world) {
  if (!player?.alive || !world?.map) return false;
  const range = WEAPONS[activeGunKey(player)]?.range ?? 0;
  const sx = player.x + player.w / 2;
  // The shot starts from the gun at chest height, not from the top-left corner of the body box.
  const sy = player.y + 25;
  const ax = player.controls.aimX - sx;
  const ay = player.controls.aimY - sy;
  const len = Math.hypot(ax, ay);
  if (len < 1) return false;
  // Turn the aim direction into a unit vector so we can project enemies onto it.
  const ux = ax / len;
  const uy = ay / len;

  for (const e of world.soldiers) {
    if (e === player || !e.alive || e.team === player.team) continue;
    const ex = e.x + e.w / 2;
    const ey = e.y + e.h / 2;
    const dx = ex - sx;
    const dy = ey - sy;
    // "along" = how far the enemy is along the aim line (dot product); behind us or out of range is skipped.
    const along = dx * ux + dy * uy;
    if (along <= 0 || along > range) continue;
    // "off" = sideways distance from the aim line (cross product); must be within half the body plus slack.
    const off = Math.abs(dx * uy - dy * ux);
    if (off > e.h / 2 + AUTO_FIRE_SLACK) continue;
    // A wall between us and the enemy blocks the shot, so it does not count.
    if (raycast(world.map, sx, sy, ex, ey, 8)) continue;
    return true;
  }
  return false;
}

// Aim assist is only for the local human player, offline, on Easy difficulty.
export const aimAssistOn = (world, shooter) => !!world && !!shooter?.isPlayer && world.player === shooter && world.mode !== 'online'
  && world.difficulty?.name === DIFFICULTY.easy.name;

/**
 * Easy-mode aim assist: nudges the aim point towards the closest visible enemy inside the cone.
 * @param {object} world the game world
 * @param {object} shooter the soldier who is firing
 * @param {{x:number,y:number}} aim the raw aim point (mouse / stick position in world space)
 * @returns {{x:number,y:number}} the (possibly bent) aim point, same distance from the gun
 */
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
    // Wrap the angle difference into -PI..PI so left and right turns compare correctly.
    const off = Math.atan2(Math.sin(turn), Math.cos(turn));
    if (Math.abs(off) > AIM_ASSIST.cone) continue;
    if (raycast(world.map, sx, sy, ex, ey, 8)) continue;
    if (!best || d < best.d) best = { d, off };
  }
  if (!best) return aim;
  // Turn towards the target, but never more than maxBend, so the player still has to aim.
  const bent = angle + Math.sign(best.off) * Math.min(Math.abs(best.off), AIM_ASSIST.maxBend);
  const len = Math.hypot(aim.x - sx, aim.y - sy);
  return { x: sx + Math.cos(bent) * len, y: sy + Math.sin(bent) * len };
}
