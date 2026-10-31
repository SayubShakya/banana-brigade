// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { WEAPONS } from '../game/config.js';
import { MAPS } from '../game/maps.js';
import { MODE_NAMES } from './rank.js';

export const FILTERS = [['all', 'All'], ['solo', 'Solo'], ['online', 'Online'], ['quick', 'Quick Play'], ['survival', 'Survival'], ['team', 'Team'], ['campaign', 'Campaign']];

export const clock = (s) => {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

export const modeName = (mode) => MODE_NAMES[mode] ?? mode ?? 'Battle';
export const mapLabel = (id) => (id ? MAPS[id]?.name ?? id : '—');
export const weaponName = (w) => (w ? WEAPONS[w]?.name ?? w : '');

export function resultLabel(r) {
  if (r.mode === 'survival') return { text: `Wave ${r.wave ?? 0}`, kind: 'wave' };
  if (r.draw) return { text: 'Draw', kind: 'draw' };
  return r.won ? { text: 'Won', kind: 'won' } : { text: 'Lost', kind: 'lost' };
}

export function winnerLabel(match) {
  const w = match?.winner;
  if (!w) return match?.mode === 'survival' ? 'Survival run' : 'No winner';
  if (match.teamMode && (w === 'blue' || w === 'red')) return `${w === 'blue' ? 'Blue' : 'Red'} team won`;
  return `${w} won`;
}

const PUZZLE_FOR = { deploy: 'to deploy', respawn: 'to respawn', crate: 'for a crate' };

export function sentence(e) {
  const by = e.by || 'Someone';
  switch (e.type) {
    case 'kill': {
      const w = weaponName(e.weapon);
      if (!e.target) return `${by} scored a kill${w ? ` with ${w}` : ''}`;
      if (e.target === e.by) return `${by} was taken out${w ? ` by their own ${w}` : ''}`;
      return `${by} ✶ ${e.target}${w ? ` with ${w}` : ''}`;
    }
    case 'puzzle': {
      const why = PUZZLE_FOR[e.detail] ?? '';
      return `${by} ${e.ok ? 'solved' : 'missed'} a banana puzzle${why ? ` ${why}` : ''}`;
    }
    case 'crate': return `${by} opened a banana crate${e.detail ? `: ${weaponName(e.detail)}` : ''}`;
    case 'power': return `${by} picked a power${e.detail ? `: ${e.detail}` : ''}`;
    case 'drop': return `${by} called a supply drop${e.detail ? `: ${e.detail}` : ''}`;
    case 'respawn': return `${by} respawned`;
    case 'wave': return `${e.detail || 'A new wave'} started`;
    case 'join': return `${by} joined the battle`;
    case 'leave': return `${by} left the battle`;
    case 'end': return `Battle over${e.detail ? `: ${e.detail}` : ''}`;
    default: return e.detail || by;
  }
}

export const ICONS = { kill: 'cross', puzzle: 'banana', crate: 'shield', power: 'chevron', drop: 'target', respawn: 'helmet', wave: 'team', join: 'user', leave: 'user', end: 'trophy' };

export function rankRoster(roster = []) {
  return [...roster].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0) || (a.deaths ?? 0) - (b.deaths ?? 0)).map((r, i) => ({ ...r, rank: i + 1 }));
}

export function soloWinner(roster = [], won = false, draw = false) {
  if (draw) return null;
  const me = roster.find((r) => r.me);
  if (won) return me?.name ?? null;
  return rankRoster(roster.filter((r) => r !== me))[0]?.name ?? null;
}

export const kd = (k, d) => (d ? k / d : k).toFixed(2);

export const ago = (iso, now = Date.now()) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const boardStat = (r, mode, by) => (by !== 'career' && mode === 'survival' ? r.wave ?? 0 : r.kills ?? 0);

export function pinnedMe({ rows = [], me } = {}, myName) {
  if (!me) return null;
  const username = me.username ?? myName;
  return !username || rows.some((r) => r.username === username) ? null : { ...me, username };
}
