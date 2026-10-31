// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { POWERS, WEAPONS } from './config.js';

export const LOG_CAP = 300;
export const ROSTER_CAP = 12;
export const END_TEXT = { time: 'Time up', 'kill limit': 'Kill limit', target: 'Target reached', quit: 'Ended early', down: 'Player down', out: 'Out of lives', host: 'Host ended it' };
const PURPOSE_TEXT = { deploy: 'deploy', respawn: 'respawn', crate: 'crate' };

const clip = (v) => (v == null ? undefined : String(v).slice(0, 40));
const tenth = (n) => Math.round((Number(n) || 0) * 10) / 10;
const weaponName = (w) => WEAPONS[w]?.name ?? w;
const powerName = (p) => POWERS[p]?.name ?? p;
const isHuman = (s) => !!s.isPlayer || String(s.id).startsWith('u');

export function createBattleLog(world, { clock = () => world.time } = {}) {
  const list = [];
  let end = null;

  function add(type, fields = {}) {
    if (end) return null;
    const entry = { t: tenth(clock()), type };
    for (const k of ['by', 'target', 'weapon', 'detail']) if (fields[k] != null) entry[k] = clip(fields[k]);
    if (typeof fields.ok === 'boolean') entry.ok = fields.ok;
    if (type === 'end') end = entry;
    else if (list.length < LOG_CAP - 1) list.push(entry);
    return entry;
  }

  const record = (event, p = {}) => {
    switch (event) {
      case 'soldier:killed':
        if (p.victim?.isDummy) break;
        add('kill', { by: p.killer?.name ?? p.victim.name, target: p.victim.name, weapon: weaponName(p.weapon) });
        break;
      case 'soldier:respawned': if (!p.soldier?.isDummy) add('respawn', { by: p.soldier.name }); break;
      case 'power:start': add('power', { by: p.soldier.name, detail: powerName(p.power) }); break;
      case 'pickup:taken': if (p.kind === 'weapon' && p.crate) add('crate', { by: p.soldier.name, detail: weaponName(p.weapon) }); break;
      case 'banana:drop': add('drop', { by: p.soldier.name, detail: 'Supply drop' }); break;
      case 'survival:wave': add('wave', { detail: `Wave ${p.wave}` }); break;
      case 'match:ended': add('end', { detail: END_TEXT[p.reason] ?? p.reason }); break;
      default: break;
    }
  };

  const original = world.emit;
  world.emit = (event, payload) => { try { record(event, payload); } catch { } return original(event, payload); };

  const puzzle = (by, ok, purpose) => add('puzzle', { by, ok: !!ok, detail: PURPOSE_TEXT[purpose] ?? purpose });

  return {
    add,
    puzzle,
    opening(by, { attempts = 0, solved = 0 } = {}) {
      for (let i = 0; i < attempts; i++) puzzle(by, i >= attempts - solved, 'deploy');
      if (world.mode === 'survival' && world.wave > 0) add('wave', { detail: `Wave ${world.wave}` });
    },
    entries: () => (end ? [...list, end] : [...list]),
    roster(meName = null) {
      const isMe = (s) => s === world.player || (meName != null && s.name === meName);
      const ranked = world.soldiers.filter((s) => !s.isDummy && !s.gone).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const top = ranked.slice(0, ROSTER_CAP);
      const mine = ranked.find(isMe);
      if (mine && !top.includes(mine)) top[ROSTER_CAP - 1] = mine;
      return top.map((s) => {
        const row = { name: clip(s.name), kills: s.kills, deaths: s.deaths, bot: !isHuman(s) };
        if (s.team === 'blue' || s.team === 'red') row.team = s.team;
        if (isMe(s)) row.me = true;
        if (String(s.id).startsWith('u')) row.userId = String(s.id).slice(1);
        return row;
      });
    },
    detach() { world.emit = original; },
  };
}
