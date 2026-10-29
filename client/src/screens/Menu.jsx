// Main menu: your soldier and rank, the ways to play, and the daily challenge.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rankFor, xpFor } from '../rank.js';
import { Icon, AvatarCanvas, RankCard, Sky } from './common.jsx';

// Three clear choices, like the original's Quick Play / Online / Local menu.
const MAIN = [
  { action: 'campaign', icon: 'map', name: 'Campaign', text: '9 missions · earn stars · unlock chapters', tag: 'Missions', primary: true },
  { action: 'quick', icon: 'cross', name: 'Quick Play', text: 'Free-for-all vs 5 bots · first to 20 kills', tag: 'Deploy' },
  { action: 'online', icon: 'globe', name: 'Play Online', text: 'Real players · share a room code', tag: 'Rooms' },
  { action: 'modes', icon: 'shield', name: 'More Modes', text: 'Survival · Team Battle · Training', tag: 'Choose' },
];
const RAIL = [['profile', 'user', 'Profile'], ['scores', 'trophy', 'Scores'], ['avatar', 'helmet', 'Avatar'], ['settings', 'gear', 'Settings']];

export default function Menu({ account, isNew, parts, onDeploy, onOpen }) {
  const [rank, setRank] = useState(rankFor(0));
  const [daily, setDaily] = useState(null);
  useEffect(() => {
    api.myRecord().then(({ totals }) => setRank(rankFor(xpFor(totals)))).catch(() => {});
    api.daily().then(setDaily).catch(() => {});
  }, []);

  return (
    <section className="screen menu v2">
      <Sky />
      <nav className="menu-rail" aria-label="Your soldier">
        {RAIL.map(([screen, icon, label]) => <button key={screen} className="tile" onClick={() => onOpen(screen)}><Icon id={icon} />{label}</button>)}
        {account.role === 'admin' && <button className="tile" onClick={() => onOpen('admin')}><Icon id="lock" />Admin</button>}
      </nav>

      <div className="menu-left">
        <div className="brand"><img className="emblem" src="/logo.svg" alt="" /><h1 className="logo">BANANA<span>BRIGADE</span></h1></div>
        <div className="podium">
          <div className="name-tag"><b>{account.username}</b>{account.role === 'admin' && <span className="role-badge" data-role="admin">admin</span>}{account.guest && <span className="role-badge" data-role="guest">guest</span>}</div>
          <AvatarCanvas id="menu-avatar" parts={parts} aria-label="Your soldier" />
          <div className="rock" aria-hidden="true" />
        </div>
        <RankCard rank={rank} />
        {account.guest
          ? <button className="welcome guest-save" onClick={() => onOpen('save')}>Playing as a guest · <b>Save your progress</b></button>
          : isNew && <p className="welcome">Welcome to the Brigade, {account.username}!</p>}
      </div>

      <nav className="menu-right" aria-label="Play">
        {MAIN.map((m) => (
          <button key={m.action} className={`mode-card big${m.primary ? ' primary' : ''}`} onClick={() => (m.action === 'modes' || m.action === 'campaign' ? onOpen(m.action) : onDeploy(m.action))}>
            <Icon id={m.icon} className="mode-ico" />
            <span className="mode-text"><b>{m.name}</b><small>{m.text}</small></span>
            <span className="mode-tag">{m.tag}</span>
          </button>
        ))}
        <button className="daily-card" onClick={() => onOpen('daily')}>
          <Icon id="banana" />
          <span>Daily Banana Challenge
            <small>{!daily ? '5 puzzles · same for everyone today'
              : daily.played ? `Done today: ${daily.result.score} points · streak ${daily.streak}`
                : `5 puzzles · not played today${daily.streak ? ` · streak ${daily.streak}` : ''}`}</small>
          </span>
        </button>
      </nav>
    </section>
  );
}
