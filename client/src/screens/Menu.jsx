// Main menu: who is playing, their rank, the Banana API status and the game modes.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rankFor, xpFor } from '../rank.js';
import { Icon, AvatarCanvas, RankCard, Sky } from './common.jsx';

// Three clear choices, like the original's Quick Play / Online / Local menu.
const MAIN = [
  { action: 'quick', icon: 'cross', name: 'Quick Play', text: 'Free-for-all vs 5 bots · first to 20 kills', tag: 'Deploy', primary: true },
  { action: 'online', icon: 'globe', name: 'Play Online', text: 'Real players · share a room code', tag: 'Rooms' },
  { action: 'modes', icon: 'shield', name: 'More Modes', text: 'Survival · Team Battle · Training', tag: 'Choose' },
];
const RAIL = [['profile', 'user', 'Profile'], ['scores', 'trophy', 'Scores'], ['avatar', 'helmet', 'Avatar'], ['settings', 'gear', 'Settings']];

function useApiStatus() {
  const [status, setStatus] = useState({ state: 'unknown', text: 'Banana API: checking…' });
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const s = await api.status();
        const state = s.online === false ? 'offline' : s.online ? 'online' : 'unknown';
        const text = state === 'offline' ? `Banana API offline${s.reserve ? ` · ${s.reserve} reserve puzzles` : ''}`
          : state === 'online' ? `Banana API online · ${s.ready} ready` : 'Banana API: checking…';
        if (alive) setStatus({ state, text });
      } catch {
        if (alive) setStatus({ state: 'offline', text: 'Server unreachable' });
      }
    };
    check();
    const id = setInterval(check, 10000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return status;
}

export default function Menu({ account, isNew, parts, onDeploy, onOpen, onLogout }) {
  const status = useApiStatus();
  const [rank, setRank] = useState(rankFor(0));
  useEffect(() => {
    api.myRecord().then(({ totals }) => setRank(rankFor(xpFor(totals)))).catch(() => {});
  }, []);

  return (
    <section className="screen menu v2">
      <Sky />
      <header className="menu-top">
        <div className="account">
          <div className="chip player-chip"><span className="dot" />{account.username}<span className="role-badge" data-role={account.role}>{account.role}</span></div>
          <button className="chip chip-btn" type="button" onClick={onLogout}>Log out</button>
        </div>
        <div className="chip api-chip" data-state={status.state} title="Banana API status"><span className="dot" /><span>{status.text}</span></div>
      </header>

      <nav className="menu-rail" aria-label="Your soldier">
        {RAIL.map(([screen, icon, label]) => <button key={screen} className="tile" onClick={() => onOpen(screen)}><Icon id={icon} />{label}</button>)}
      </nav>

      <div className="menu-left">
        <h1 className="logo">BANANA<span>BRIGADE</span><i className="badge">JETPACK WARS</i></h1>
        <div className="podium">
          <AvatarCanvas id="menu-avatar" parts={parts} aria-label="Your soldier" />
          <div className="rock" aria-hidden="true" />
        </div>
        <RankCard rank={rank} />
        <p className="welcome">{isNew ? `Welcome to the Brigade, ${account.username}!` : `Welcome back, ${account.username}.`}</p>
      </div>

      <nav className="menu-right" aria-label="Play">
        {MAIN.map((m) => (
          <button key={m.action} className={`mode-card big${m.primary ? ' primary' : ''}`} onClick={() => (m.action === 'modes' ? onOpen('modes') : onDeploy(m.action))}>
            <Icon id={m.icon} className="mode-ico" />
            <span className="mode-text"><b>{m.name}</b><small>{m.text}</small></span>
            <span className="mode-tag">{m.tag}</span>
          </button>
        ))}
        <p className="banana-note"><Icon id="banana" />Banana puzzles let you deploy, respawn early and open crates.</p>
      </nav>
    </section>
  );
}
