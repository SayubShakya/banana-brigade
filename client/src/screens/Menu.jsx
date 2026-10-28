// Main menu: who is playing, their rank, the Banana API status and the game modes.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rankFor, xpFor } from '../rank.js';
import { puzzleStats } from '../storage.js';
import { useRefreshOn } from '../hooks.js';
import { Icon, AvatarCanvas, RankCard, Sky } from './common.jsx';

const MODE_CARDS = [
  { mode: 'quick', icon: 'cross', name: 'Quick Play', text: 'Free-for-all · first to 20 kills', primary: true },
  { mode: 'survival', icon: 'shield', name: 'Survival', text: 'Endless waves · Banana revives only' },
  { mode: 'training', icon: 'target', name: 'Training', text: 'Practice range with dummies' },
  { mode: 'team', icon: 'team', name: 'Team Battle', text: 'Blue vs Red with bots' },
  { mode: 'online', icon: 'globe', name: 'Online', text: 'Real players · rooms with a code', online: true },
];

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
  const api_ = useApiStatus();
  const [rank, setRank] = useState(rankFor(0));
  useRefreshOn('banana:answered');
  useEffect(() => {
    api.myRecord().then(({ totals }) => setRank(rankFor(xpFor(totals)))).catch(() => {});
  }, []);
  const acc = puzzleStats.attempts ? `${Math.round((puzzleStats.solved / puzzleStats.attempts) * 100)}%` : '—';

  return (
    <section className="screen menu">
      <Sky />
      <header className="menu-top">
        <div className="account">
          <div className="chip player-chip"><span className="dot" />{account.username}<span className="role-badge" data-role={account.role}>{account.role}</span></div>
          <button className="chip chip-btn" type="button" onClick={onLogout}>Log out</button>
        </div>
        <div className="stat-chips" aria-label="Your Banana puzzle record">
          <div className="chip"><Icon id="banana" /><b>{puzzleStats.solved}</b><span>solved</span></div>
          <div className="chip"><b>{puzzleStats.best}</b><span>best streak</span></div>
          <div className="chip"><b>{acc}</b><span>accuracy</span></div>
          <div className="chip api-chip" data-state={api_.state} title="Banana API status"><span className="dot" /><span>{api_.text}</span></div>
        </div>
      </header>

      <div className="menu-left">
        <h1 className="logo">BANANA<span>BRIGADE</span><i className="badge">JETPACK WARS</i></h1>
        <div className="podium">
          <AvatarCanvas id="menu-avatar" parts={parts} aria-label="Your soldier" />
          <div className="rock" aria-hidden="true" />
        </div>
        <RankCard rank={rank} />
        <p className="welcome">{isNew ? `Welcome to the Brigade, ${account.username}!` : `Welcome back, ${account.username}.`}</p>
      </div>

      <nav className="menu-right" aria-label="Game modes">
        {MODE_CARDS.map((m) => (
          <button key={m.mode} className={`mode-card${m.primary ? ' primary' : ''}`} onClick={() => onDeploy(m.mode)}>
            <Icon id={m.icon} className="mode-ico" />
            <span className="mode-text"><b>{m.name}</b><small>{m.text}</small></span>
            <span className="mode-tag">{m.online ? <><Icon id="globe" />Play</> : <><Icon id="banana" />Deploy</>}</span>
          </button>
        ))}
        <div className="menu-tiles">
          <button className="tile" onClick={() => onOpen('profile')}><Icon id="user" />Profile</button>
          <button className="tile" onClick={() => onOpen('scores')}><Icon id="trophy" />Scores</button>
          <button className="tile" onClick={() => onOpen('avatar')}><Icon id="helmet" />Avatar</button>
          <button className="tile" onClick={() => onOpen('settings')}><Icon id="gear" />Settings</button>
        </div>
        <p className="banana-note"><Icon id="banana" />Every mode starts with a Banana puzzle. Solve it to deploy.</p>
      </nav>
    </section>
  );
}
