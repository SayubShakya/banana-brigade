// Profile and Scores screens. Both read saved games from the server
// (/api/scores/me and /api/scores/leaderboard), so a player's record follows
// their account rather than the browser they play on.
//
// Rank: experience points (XP) are worked out from the saved record:
//   10 XP per kill, 25 per Banana puzzle solved, 100 per win.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODE_NAMES = { quick: 'Quick Play', survival: 'Survival', training: 'Training', team: 'Multiplayer' };

export const RANKS = [
  { name: 'Recruit', xp: 0 },
  { name: 'Private', xp: 500 },
  { name: 'Corporal', xp: 1500 },
  { name: 'Sergeant', xp: 3500 },
  { name: 'Lieutenant', xp: 7000 },
  { name: 'Captain', xp: 12000 },
  { name: 'Major', xp: 20000 },
  { name: 'Colonel', xp: 32000 },
  { name: 'General', xp: 50000 },
  { name: 'Banana Marshal', xp: 80000 },
];

export const xpFor = (t) => (t.kills ?? 0) * 10 + (t.puzzles_solved ?? 0) * 25 + (t.wins ?? 0) * 100;

export function rankFor(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const next = RANKS[i + 1];
  return { name: RANKS[i].name, xp, floor: RANKS[i].xp, next: next?.xp ?? null };
}

// Fills a rank card: <b id="{prefix}-rank">, the XP fill bar and its label.
export function showRank(prefix, rank) {
  $(`${prefix}-rank`).textContent = rank.name;
  const pct = rank.next ? ((rank.xp - rank.floor) / (rank.next - rank.floor)) * 100 : 100;
  $(`${prefix}-xp-fill`).style.width = `${Math.max(2, pct)}%`;
  $(`${prefix}-xp`).textContent = rank.next ? `${rank.xp.toLocaleString()} / ${rank.next.toLocaleString()} XP` : `${rank.xp.toLocaleString()} XP · top rank`;
}

export async function fetchMyRecord() {
  const res = await fetch('/api/scores/me');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const playTime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`);
const when = (iso) => new Date(`${iso.replace(' ', 'T')}Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export async function loadProfile() {
  const { totals: t, recent } = await fetchMyRecord();
  showRank('profile', rankFor(xpFor(t)));
  const kd = t.deaths ? (t.kills / t.deaths).toFixed(2) : t.kills.toFixed(2);
  const acc = t.puzzles_attempted ? `${Math.round((t.puzzles_solved / t.puzzles_attempted) * 100)}%` : '—';
  const items = [
    ['Battles', t.games], ['Wins', t.wins], ['Kills', t.kills], ['Deaths', t.deaths],
    ['K/D ratio', kd], ['Best kills', t.best_kills], ['Best wave', t.best_wave], ['Time played', playTime(t.seconds_played)],
    ['Puzzles solved', t.puzzles_solved], ['Puzzle accuracy', acc],
  ];
  $('profile-record').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('profile-recent').innerHTML = recent.length
    ? recent.slice(0, 6).map((r) => `<tr><td>${MODE_NAMES[r.mode]}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.puzzles_solved} / ${r.puzzles_attempted}</td>`
      + `<td>${r.mode === 'survival' ? `Wave ${r.wave}` : r.won ? '<span class="win">Won</span>' : 'Lost'}</td><td>${when(r.created_at)}</td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="6">No battles yet. Deploy to start your record.</td></tr>';
}

export async function loadBoards(mode, me) {
  const main = mode === 'survival' ? 'Wave' : 'Kills';
  document.querySelectorAll('#screen-scores th[data-col="main"]').forEach((th) => { th.textContent = main; });
  const rows = (list) => (list.length
    ? list.map((r, i) => `<tr class="${r.username === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.username)}</td>`
      + `<td>${mode === 'survival' ? r.wave : r.kills}</td><td>${r.puzzles_solved} / ${r.puzzles_attempted}</td></tr>`).join('')
    : '<tr class="empty-row"><td colspan="4">No scores yet.</td></tr>');
  const get = async (period) => (await (await fetch(`/api/scores/leaderboard?mode=${mode}&period=${period}&limit=10`)).json()).rows;
  const [today, all] = await Promise.all([get('today'), get('all')]);
  $('board-today').innerHTML = rows(today);
  $('board-all').innerHTML = rows(all);
}
