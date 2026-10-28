// The battle HUD: health and jetpack bars, ammo, grenades, timer, score, kill feed,
// the death / Banana respawn message, the banana crate prompt and the Tab scoreboard.
// Bars are refreshed every frame from the world; everything else reacts to events
// that the world publishes on the event bus.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { on } from '../eventBus.js';
import { WEAPONS, SOLDIER, PHYSICS, PICKUPS, POWERS } from './config.js';
import { activeGun } from './world.js';
import { drawAvatarPreview } from './characters.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (sec) => { const s = Math.ceil(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function createHud() {
  const el = {
    hud: $('hud'), badge: $('hud-avatar'), hp: $('hp-fill'), hpText: $('hp-text'), fuel: $('fuel-fill'),
    timer: $('timer'), feed: $('killfeed'), score: $('score'), rank: $('rank'),
    weapon: $('weapon-name'), ammo: $('ammo'), reload: $('reload-fill'), reloadBar: $('reload-bar'),
    grenades: $('grenades'), zoom: $('zoom-label'), msg: $('center-msg'), crate: $('crate-prompt'),
    board: $('scoreboard'), boardBody: $('scoreboard-body'), flash: $('hit-flash'), toast: $('hud-toast'), buffs: $('buffs'), help: $('hud-help'),
  };
  let world = null;
  let banners = true;   // kill-streak banners (Settings)
  let helpTimer = 0;
  let crateNearUntil = 0;
  let pickupText = '';
  let pickupUntil = 0;
  let zoomLevel = 0;    // 0, 1 or 2 from the Z key / mouse wheel
  let zoomText = '';

  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.remove('show');
    void el.toast.offsetWidth; // restart the CSS animation
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

  on('soldier:killed', ({ victim, killer, weapon }) => {
    if (victim.isDummy) return;
    if (killer && killer !== victim) feed(`${nameTag(killer)} <span class="weapon">[${esc(weapon)}]</span> ${nameTag(victim)}`);
    else feed(`${nameTag(victim)} <span class="weapon">blew themselves up</span>`);
    if (banners && killer?.isPlayer && killer !== victim && killer.streak >= 3) toast(killer.streak >= 5 ? `Banana Rampage! ${killer.streak} kills` : `${killer.streak}-kill streak!`);
  });
  on('soldier:damaged', ({ victim }) => {
    if (!victim.isPlayer) return;
    el.flash.classList.remove('on');
    void el.flash.offsetWidth;
    el.flash.classList.add('on');
  });
  on('pickup:available', ({ weapon, banana }) => {
    if (banana) { crateNearUntil = performance.now() + 150; return; }
    pickupText = `E · pick up ${WEAPONS[weapon].name}`;
    pickupUntil = performance.now() + 150;
  });
  on('pickup:taken', ({ soldier, kind, weapon }) => {
    if (!soldier.isPlayer) return;
    if (kind === 'health') toast('+50 health');
    else if (kind === 'shield') toast(`Shield: absorbs ${PICKUPS.shieldAmount} damage for ${PICKUPS.shieldTime} s`);
    else if (kind === 'fuel') toast(`Jet fuel: full tank, unlimited for ${PICKUPS.fuelBoostTime} s`);
    else if (kind === 'ammo') toast('Ammo box: spare ammo refilled');
    else if (kind === 'banana') { /* the power:start toast says which power */ }
    else toast(`Picked up ${WEAPONS[weapon].name}`);
  });
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
      zoomText = '1x';
      drawAvatarPreview(el.badge, w.player.avatar);
      // The controls, shown for the first seconds of every battle.
      el.help.hidden = false;
      el.help.classList.remove('fade');
      clearTimeout(helpTimer);
      helpTimer = setTimeout(() => el.help.classList.add('fade'), 7000);
      // Name the battlefield; keep any message already showing (e.g. the first wave).
      const showing = el.toast.classList.contains('show') ? el.toast.textContent : '';
      toast(showing ? `Map: ${w.map.name} · ${showing}` : `Map: ${w.map.name}`);
    },
    setBanners(on) { banners = on; },
    hide() { world = null; el.hud.hidden = true; el.board.hidden = true; el.help.hidden = true; },
    update() {
      if (!world) return;
      const p = world.player;
      el.hp.style.width = `${(p.health / SOLDIER.maxHealth) * 100}%`;
      el.hp.className = p.health > 50 ? 'fill good' : p.health > 25 ? 'fill warn' : 'fill bad';
      el.hpText.textContent = Math.ceil(p.health);
      el.fuel.style.width = `${(p.fuel / PHYSICS.fuelMax) * 100}%`;
      // Active power-ups (shield points, infinite jet fuel), only rewritten when they change.
      const pw = p.power && POWERS[p.power.id];
      const buffs = `${pw ? `<span class="buff power" style="--power:${pw.color}">${pw.icon} ${pw.name.toUpperCase()} ${Math.ceil(p.power.timer)}s</span>` : ''}${p.armor > 0 ? `<span class="buff shield">SHIELD ${Math.ceil(p.armor)}</span>` : ''}${p.fuelBoost > 0 ? `<span class="buff fuel">JET ∞ ${Math.ceil(p.fuelBoost)}s</span>` : ''}`;
      if (buffs !== el.buffs.dataset.last) { el.buffs.innerHTML = buffs; el.buffs.dataset.last = buffs; }

      const gun = activeGun(p);
      const w = WEAPONS[gun.key];
      el.weapon.textContent = w.name;
      el.ammo.textContent = `${gun.ammo} / ${gun.spare === Infinity ? '∞' : gun.spare}`;
      el.grenades.textContent = p.grenades;
      // Only the sniper reaches 3x, which is the scope; other guns stop at 2x.
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
          el.rank.textContent = 'Shoot the dummies · Esc to leave';
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
          el.rank.textContent = `Blue ${world.teamKills.blue} – ${world.teamKills.red} Red · first to ${world.cfg.killLimit}`;
          break;
        default: {
          const better = players.filter((s) => s.kills > p.kills).length;
          el.timer.textContent = fmtTime(world.timeLeft);
          el.rank.textContent = `#${better + 1} of ${players.length} · first to ${world.cfg.killLimit}`;
        }
      }

      // Death message with the Banana respawn offer.
      if (!p.alive && !world.over) {
        const by = p.lastAttacker && p.lastAttacker !== p ? `Killed by ${esc(p.lastAttacker.name)}` : 'You went down';
        el.msg.innerHTML = world.mode === 'campaign' && p.lives <= 0 ? `${by}: <b>out of lives</b>`
          : world.mode === 'survival'
          ? `${by} — <b>solve a Banana puzzle to revive</b> (B)`
          : `${by} — respawning in ${Math.ceil(p.respawnTimer)} · <b>Banana respawn now</b> (B)`;
        el.msg.hidden = false;
      } else el.msg.hidden = true;

      // Banana crate prompt when standing next to one; weapon pickup hint otherwise.
      const now = performance.now();
      if (p.alive && now < crateNearUntil) {
        el.crate.hidden = false;
        el.crate.innerHTML = '<svg class="ico"><use href="#i-banana"/></svg>Banana crate · <b>E</b> to open';
      } else if (p.alive && now < pickupUntil) {
        el.crate.hidden = false;
        el.crate.textContent = pickupText;
      } else el.crate.hidden = true;

      if (!el.board.hidden) renderBoard();
    },
  };
}
