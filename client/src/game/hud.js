// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { on, emit } from '../services/eventBus.js';
import { WEAPONS, SOLDIER, PHYSICS, PICKUPS, POWERS, BANANA_METER } from './config.js';
import { activeGun } from './world.js';
import { drawAvatarPreview } from './characters.js';
import '../styles/match.css';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (sec) => { const s = Math.ceil(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const MINI_ROWS = 5;
const LIVE_MODES = ['quick', 'team', 'online'];
const calm = () => document.body.classList.contains('a11y-calm') || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function miniRows(world) {
  const p = world.player;
  if (world.teamMode) {
    return ['blue', 'red']
      .map((team) => ({ id: `team-${team}`, name: team === 'blue' ? 'Blue' : 'Red', kills: world.teamKills[team], me: p?.team === team, team }))
      .sort((a, b) => b.kills - a.kills || (a.team === 'blue' ? -1 : 1))
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }
  const players = world.soldiers.filter((s) => !s.isDummy);
  const ranked = players.sort((a, b) => b.kills - a.kills || (b === p) - (a === p) || a.deaths - b.deaths || (a.id < b.id ? -1 : 1))
    .map((s) => ({ id: s.id, name: s.name, kills: s.kills, me: s === p, rank: players.filter((o) => o.kills > s.kills).length + 1 }));
  const top = ranked.slice(0, MINI_ROWS);
  const mine = ranked.find((r) => r.me);
  return mine && !top.includes(mine) ? [...top, { ...mine, gap: true }] : top;
}

export function createHud() {
  const el = {
    hud: $('hud'), badge: $('hud-avatar'), hp: $('hp-fill'), hpText: $('hp-text'), fuel: $('fuel-fill'),
    timer: $('timer'), feed: $('killfeed'), score: $('score'), rank: $('rank'),
    weapon: $('weapon-name'), ammo: $('ammo'), reload: $('reload-fill'), reloadBar: $('reload-bar'),
    grenades: $('grenades'), zoom: $('zoom-label'), msg: $('center-msg'), crate: $('crate-prompt'),
    board: $('scoreboard'), boardBody: $('scoreboard-body'), flash: $('hit-flash'), toast: $('hud-toast'), buffs: $('buffs'), help: $('hud-help'),
    meter: $('banana-meter'), meterFill: $('meter-fill'), meterText: $('meter-text'), supply: $('supply-btn'),
    mini: $('mini-board'),
  };
  const miniEls = new Map();
  let miniKey = '';
  let meterShown = -1;
  el.supply.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); emit('input:supply'); });
  let world = null;
  let banners = true;
  let helpTimer = 0;
  let crateNearUntil = 0;
  let crateSupply = false;
  let pickupText = '';
  let pickupUntil = 0;
  let zoomLevel = 0;
  let zoomText = '';

  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.remove('show');
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
  }

  function feed(html) {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = html;
    el.feed.prepend(row);
    while (el.feed.children.length > 4) el.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 4000);
    setTimeout(() => row.remove(), 5000);
  }
  const nameTag = (s) => `<span class="${s.isPlayer ? 'me' : s.team === 'blue' ? 'team-blue' : s.team === 'red' ? 'team-red' : ''}">${esc(s.name)}</span>`;

  const headTag = '<span class="headshot-tag" title="Headshot">🎯 HEADSHOT</span>';
  on('soldier:killed', ({ victim, killer, weapon, headshot }) => {
    if (victim.isDummy) return;
    if (killer && killer !== victim) feed(`${nameTag(killer)} <span class="weapon">[${esc(weapon)}]</span>${headshot ? ` ${headTag}` : ''} ${nameTag(victim)}`);
    else feed(`${nameTag(victim)} <span class="weapon">blew themselves up</span>`);
    if (banners && killer?.isPlayer && killer !== victim && killer.streak >= 3) toast(killer.streak >= 5 ? `Banana Rampage! ${killer.streak} kills` : `${killer.streak}-kill streak!`);
  });
  on('soldier:damaged', ({ victim }) => {
    if (!victim.isPlayer) return;
    el.flash.classList.remove('on');
    void el.flash.offsetWidth;
    el.flash.classList.add('on');
  });
  on('pickup:available', ({ weapon, banana, supply }) => {
    if (banana) { crateNearUntil = performance.now() + 150; crateSupply = !!supply; return; }
    pickupText = `E · pick up ${WEAPONS[weapon].name}`;
    pickupUntil = performance.now() + 150;
  });
  on('pickup:taken', ({ soldier, kind, weapon }) => {
    if (!soldier.isPlayer) return;
    if (kind === 'health') toast('+50 health');
    else if (kind === 'shield') toast(`Shield: absorbs ${PICKUPS.shieldAmount} damage for ${PICKUPS.shieldTime} s`);
    else if (kind === 'fuel') toast(`Jet fuel: full tank, unlimited for ${PICKUPS.fuelBoostTime} s`);
    else if (kind === 'ammo') toast('Ammo box: spare ammo refilled');
    else if (kind === 'banana') { }
    else toast(`Picked up ${WEAPONS[weapon].name}`);
  });
  on('banana:meter', ({ soldier, gained, grade, full, streak }) => {
    if (!soldier?.isPlayer || !world || soldier !== world.player) return;
    if (gained > 0) toast(full ? `Banana Meter full! Press X for a supply drop` : `+${gained} Banana Meter${grade ? ` · ${grade.toUpperCase()}` : ''} · streak ${streak}`);
    else if (full) toast('Banana Meter full! Press X for a supply drop');
  });
  on('banana:drop', ({ soldier }) => { if (soldier?.isPlayer) toast('Supply drop! Grab the banana crate (E) for a free power'); });
  on('survival:wave', ({ wave, count }) => toast(`Wave ${wave}: ${count} enemies incoming`));
  on('power:start', ({ soldier, power, seconds, random }) => {
    if (soldier?.isPlayer) toast(`${POWERS[power].icon} ${POWERS[power].name}${random ? ' (random +bonus)' : ''}: ${POWERS[power].text} for ${seconds} s!`);
  });
  on('power:warning', ({ soldier, power }) => { if (soldier?.isPlayer) toast(`${POWERS[power].name} is running out!`); });
  on('power:end', ({ soldier, power }) => { if (soldier?.isPlayer) toast(`${POWERS[power].name} has worn off`); });
  on('survival:cleared', ({ wave }) => toast(`Wave ${wave} cleared!`));
  on('campaign:ramp', () => toast('The bots are getting sharper!'));
  on('soldier:respawned', ({ soldier }) => { if (soldier.isPlayer) toast('Back in the fight'); });
  on('input:zoom', ({ level }) => { zoomLevel = level; });
  on('input:scoreboard', ({ show }) => { if (world) el.board.hidden = !show; });

  function renderMini() {
    if (!LIVE_MODES.includes(world.mode)) { el.mini.hidden = true; return; }
    el.mini.hidden = false;
    const rows = miniRows(world);
    const key = rows.map((r) => `${r.id}:${r.name}:${r.kills}:${r.rank}`).join('|');
    if (key === miniKey) return;
    miniKey = key;
    const animate = !calm();
    const before = new Map();
    if (animate) for (const [id, li] of miniEls) before.set(id, li.getBoundingClientRect().top);
    const keep = new Set(rows.map((r) => r.id));
    for (const [id, li] of miniEls) if (!keep.has(id)) { li.remove(); miniEls.delete(id); }
    for (const r of rows) {
      let li = miniEls.get(r.id);
      const fresh = !li;
      if (fresh) {
        li = document.createElement('li');
        li.innerHTML = '<span class="mb-rank"></span><span class="mb-name"></span><span class="mb-kills"></span>';
        miniEls.set(r.id, li);
      }
      const [rank, name, kills] = li.children;
      const scored = !fresh && Number(kills.textContent) < r.kills;
      rank.textContent = r.rank;
      name.textContent = r.name;
      kills.textContent = r.kills;
      li.className = ['mb-row', r.me && 'me', r.gap && 'gap', r.team && `mb-${r.team}`].filter(Boolean).join(' ');
      el.mini.appendChild(li);
      if (scored && animate) { li.classList.remove('scored'); void li.offsetWidth; li.classList.add('scored'); }
    }
    if (!animate) return;
    for (const r of rows) {
      const li = miniEls.get(r.id);
      const dy = (before.get(r.id) ?? li.getBoundingClientRect().top) - li.getBoundingClientRect().top;
      if (dy) li.animate?.([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
  }

  function renderBoard() {
    const rows = world.soldiers.filter((s) => !s.isDummy).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    el.boardBody.innerHTML = rows.map((s, i) => `<tr class="${s.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${nameTag(s)}</td><td>${s.kills}</td><td>${s.deaths}</td></tr>`).join('');
  }

  return {
    attach(w) {
      world = w;
      el.feed.innerHTML = '';
      el.board.hidden = true;
      el.hud.hidden = false;
      el.hud.dataset.mode = w.mode;
      el.zoom.textContent = '1x';
      el.mini.replaceChildren();
      miniEls.clear();
      miniKey = '';
      el.timer.classList.remove('final');
      meterShown = -1;
      zoomText = '1x';
      drawAvatarPreview(el.badge, w.player.avatar);
      el.help.hidden = false;
      el.help.classList.remove('fade');
      clearTimeout(helpTimer);
      helpTimer = setTimeout(() => el.help.classList.add('fade'), 7000);
      const showing = el.toast.classList.contains('show') ? el.toast.textContent : '';
      toast(showing ? `Map: ${w.map.name} · ${showing}` : `Map: ${w.map.name}`);
    },
    setBanners(on) { banners = on; },
    hide() { world = null; el.hud.hidden = true; el.board.hidden = true; el.help.hidden = true; el.mini.hidden = true; el.timer.classList.remove('final'); },
    update() {
      if (!world) return;
      const p = world.player;
      el.hp.style.width = `${(p.health / SOLDIER.maxHealth) * 100}%`;
      el.hp.className = p.health > 50 ? 'fill good' : p.health > 25 ? 'fill warn' : 'fill bad';
      el.hpText.textContent = Math.ceil(p.health);
      el.fuel.style.width = `${(p.fuel / PHYSICS.fuelMax) * 100}%`;
      const m = Math.round((p.meter / BANANA_METER.max) * 100);
      if (m !== meterShown) {
        meterShown = m;
        el.meterFill.style.width = `${m}%`;
        el.meter.setAttribute('aria-valuenow', String(m));
        el.meter.classList.toggle('full', m >= 100);
        el.meterText.textContent = m >= 100 ? 'FULL · PRESS X' : `BANANA ${m}%`;
      }
      el.supply.hidden = !(p.alive && p.meter >= BANANA_METER.max);
      const pw = p.power && POWERS[p.power.id];
      const buffs = `${pw ? `<span class="buff power" style="--power:${pw.color}">${pw.icon} ${pw.name.toUpperCase()} ${Math.ceil(p.power.timer)}s</span>` : ''}${p.armor > 0 ? `<span class="buff shield">SHIELD ${Math.ceil(p.armor)}</span>` : ''}${p.fuelBoost > 0 ? `<span class="buff fuel">JET ∞ ${Math.ceil(p.fuelBoost)}s</span>` : ''}`;
      if (buffs !== el.buffs.dataset.last) { el.buffs.innerHTML = buffs; el.buffs.dataset.last = buffs; }

      const gun = activeGun(p);
      const w = WEAPONS[gun.key];
      el.weapon.textContent = w.name;
      el.ammo.textContent = `${gun.ammo} / ${gun.spare === Infinity ? '∞' : gun.spare}`;
      el.grenades.textContent = p.grenades;
      const scoped = w.zoom ? zoomLevel >= w.zoom - 1 : false;
      const z = w.zoom ? (scoped ? '3x · SCOPE' : `${zoomLevel + 1}x · Z for scope`) : `${Math.min(zoomLevel, 1) + 1}x`;
      if (z !== zoomText) { zoomText = z; el.zoom.textContent = z; }
      el.reloadBar.style.visibility = p.reloadTimer > 0 ? 'visible' : 'hidden';
      el.reload.style.width = p.reloadTimer > 0 ? `${(1 - p.reloadTimer / w.reload) * 100}%` : '0%';

      el.score.textContent = `Kills ${p.kills} · Deaths ${p.deaths}`;
      const players = world.soldiers.filter((s) => !s.isDummy);
      switch (world.mode) {
        case 'training':
          el.timer.textContent = 'TRAINING';
          el.rank.textContent = 'Shoot the dummies · pause (II) to leave';
          break;
        case 'survival': {
          const left = world.soldiers.filter((s) => s.team === 'enemy').length;
          el.timer.textContent = `WAVE ${world.wave}`;
          el.rank.textContent = left ? `${left} enemies left` : 'Next wave incoming…';
          break;
        }
        case 'campaign':
          el.timer.textContent = fmtTime(world.timeLeft);
          el.score.textContent = `Target ${p.kills} / ${world.cfg.killLimit}`;
          el.rank.textContent = `Lives ${'♥'.repeat(Math.max(0, p.lives))}${'♡'.repeat(Math.max(0, world.cfg.lives - Math.max(0, p.lives)))} · ${world.cfg.name}`;
          break;
        case 'team':
          el.timer.textContent = fmtTime(world.timeLeft);
          el.rank.textContent = `You are ${p.team === 'red' ? 'Red' : 'Blue'} · Blue ${world.teamKills.blue} – ${world.teamKills.red} Red · first to ${world.cfg.killLimit}`;
          break;
        default: {
          const better = players.filter((s) => s.kills > p.kills).length;
          el.timer.textContent = fmtTime(world.timeLeft);
          el.rank.textContent = `#${better + 1} of ${players.length} · first to ${world.cfg.killLimit}`;
        }
      }

      const timed = LIVE_MODES.includes(world.mode) || world.mode === 'campaign';
      el.timer.classList.toggle('final', timed && world.timeLeft > 0 && world.timeLeft <= 10);
      renderMini();

      if (!p.alive && !world.over) {
        const by = p.lastAttacker && p.lastAttacker !== p ? `Killed by ${esc(p.lastAttacker.name)}` : 'You went down';
        el.msg.innerHTML = world.mode === 'campaign' && p.lives <= 0 ? `${by}: <b>out of lives</b>`
          : world.mode === 'survival'
          ? `${by} — <b>solve a Banana puzzle to revive</b> (B)`
          : p.bananaUsed ? `${by} — respawning in ${Math.ceil(p.respawnTimer)}`
          : `${by} — respawning in ${Math.ceil(p.respawnTimer)} · <b>Banana respawn now</b> (B)`;
        el.msg.hidden = false;
      } else el.msg.hidden = true;

      const now = performance.now();
      if (p.alive && now < crateNearUntil) {
        el.crate.hidden = false;
        el.crate.innerHTML = crateSupply ? '<svg class="ico"><use href="#i-banana"/></svg>Supply drop · <b>E</b> free power, no puzzle' : '<svg class="ico"><use href="#i-banana"/></svg>Banana crate · <b>E</b> to open';
      } else if (p.alive && now < pickupUntil) {
        el.crate.hidden = false;
        el.crate.textContent = pickupText;
      } else el.crate.hidden = true;

      if (!el.board.hidden) renderBoard();
    },
  };
}
