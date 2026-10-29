// The public home page, shown before anyone logs in: what the game is, a picture of
// a battle, how the Banana puzzles fit in, the modes, and a live line saying
// whether the Banana API is answering. Play leads to the login screen.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon, Sky } from './common.jsx';

const PUZZLES = [
  ['Deploy', 'Solve one to drop into a battle.'],
  ['Respawn', 'Down? Press B and solve one to come straight back.'],
  ['Banana crate', 'Open a crate (E) and pick a Banana Power.'],
  ['Continue', 'Out of lives in a mission? One more puzzle, one more life.'],
  ['Daily challenge', 'The same 5 puzzles for everyone, once a day.'],
];

const MODES = [
  ['map', 'Campaign', '9 missions in 3 chapters, up to 3 stars each.'],
  ['target', 'Quick Play', 'Free-for-all against 5 bots, first to 20 kills.'],
  ['shield', 'Survival', 'Waves of bots. A Banana puzzle is your only revive.'],
  ['team', 'Team Battle', '3 against 3, blue against red.'],
  ['globe', 'Online', 'Rooms of up to 6 players; the server runs the match.'],
  ['helmet', 'Training', 'Target dummies to warm up on.'],
];

// "Banana API online · 3 puzzles ready", from GET /api/status.
export function useApiLine() {
  const [line, setLine] = useState({ state: 'checking', text: 'Checking the Banana API…' });
  useEffect(() => {
    api.status()
      .then((s) => setLine(s.online === false || s.circuit?.state === 'open'
        ? { state: 'offline', text: `Banana API offline · ${s.reserve} reserve puzzles keep the game going` }
        : { state: 'online', text: `Banana API online · ${s.ready} puzzles ready` }))
      .catch(() => setLine({ state: 'offline', text: 'Game server not reachable' }));
  }, []);
  return line;
}

export default function Home({ onPlay, onGuest, onOpen }) {
  const apiLine = useApiLine();
  return (
    <section className="screen home">
      <Sky />
      <div className="home-scroll">
        <header className="home-hero">
          <div className="home-pitch">
            <div className="brand"><img className="emblem" src="/logo.svg" alt="" /><h1 className="logo small">BANANA<span>BRIGADE</span></h1></div>
            <p className="home-line">A 2D jetpack shooter where Banana puzzles decide when you fly in, when you come back and what power you get.</p>
            <div className="home-actions">
              <button className="mbtn primary" onClick={onPlay}>Play</button>
              {onGuest && <button className="mbtn" onClick={onGuest}>Play as guest</button>}
            </div>
            <span className="api-chip" data-state={apiLine.state}><i className="dot" />{apiLine.text}</span>
          </div>
          <img className="home-shot" src="/img/gameplay.jpg" alt="A battle: soldiers with jetpacks on grassy platforms, the health bar, ammo and the kill feed" />
        </header>

        <section className="home-block">
          <h2>How the Banana puzzles work</h2>
          <p>Each puzzle is a picture from the <a href="https://marcconrad.com/uob/banana/doc.php" target="_blank" rel="noreferrer">Banana API</a> with
            a hidden digit: count the bananas and type the number (0–9). Our server fetches the puzzle and keeps the answer, so it cannot be read from the page.</p>
          <ul className="home-puzzles">
            {PUZZLES.map(([name, text]) => <li key={name}><Icon id="banana" /><b>{name}</b><span>{text}</span></li>)}
          </ul>
        </section>

        <section className="home-block">
          <h2>Game modes</h2>
          <ul className="home-modes">
            {MODES.map(([icon, name, text]) => <li key={name}><Icon id={icon} /><b>{name}</b><span>{text}</span></li>)}
          </ul>
        </section>

        <footer className="home-foot">
          <button className="link-btn" onClick={() => onOpen('privacy')}>Privacy</button>
          <button className="link-btn" onClick={() => onOpen('terms')}>Terms</button>
          <span>A student project by Sayub Shakya · CIS046-3</span>
        </footer>
      </div>
    </section>
  );
}
