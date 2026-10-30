// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Icon, Sky } from '../components/common.jsx';

const PUZZLES = [
  ['Deploy', 'Solve one to drop into a battle. A GOLD solve starts you with a full Banana Meter.'],
  ['Respawn', 'Down? Press B and solve one to come straight back. GOLD adds a longer spawn shield.'],
  ['Banana crate', 'Open a crate (E) and pick a Banana Power. GOLD gives 4 cards, SILVER 3, BRONZE 2.'],
  ['Banana Meter', 'Every correct answer fills the meter, more for faster solves and streaks. Full? Press X for a supply drop: a free power, no puzzle.'],
  ['Continue', 'Out of lives in a mission? One more puzzle, one more life.'],
  ['Daily challenge', 'The same 5 puzzles for everyone, once a day.'],
];

const MODES = [
  ['map', 'Campaign', '9 missions in 3 chapters, up to 3 stars each.'],
  ['target', 'Quick Play', 'Free-for-all against 5 bots. Pick a match from 30 s to 5 min; the kill target grows with it.'],
  ['shield', 'Survival', 'Waves of bots. A Banana puzzle is your only revive.'],
  ['team', 'Team Battle', '3 against 3, blue against red.'],
  ['globe', 'Online', 'Rooms of up to 6 players; the server runs the match.'],
  ['helmet', 'Training', 'Target dummies to warm up on.'],
];

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

function Trailer({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="trailer" role="dialog" aria-label="Banana Brigade trailer" onClick={onClose}>
      <div className="trailer-box" onClick={(e) => e.stopPropagation()}>
        <video src="/media/trailer.mp4" poster="/media/trailer-poster.jpg" controls autoPlay playsInline />
        <button className="mbtn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function Home({ onPlay, onGuest, onOpen }) {
  const apiLine = useApiLine();
  const [trailer, setTrailer] = useState(false);
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
              <button className="mbtn" onClick={() => setTrailer(true)}>Watch trailer</button>
            </div>
            <span className="api-chip" data-state={apiLine.state}><i className="dot" />{apiLine.text}</span>
          </div>
          <img className="home-shot" src="/img/gameplay.jpg" alt="A battle: soldiers with jetpacks on grassy platforms, the health bar, ammo and the kill feed" />
        </header>

        <section className="home-block">
          <h2>How the Banana puzzles work</h2>
          <p>Each puzzle is a picture from the <a href="https://marcconrad.com/uob/banana/doc.php" target="_blank" rel="noreferrer">Banana API</a> with
            sums where every banana hides the same digit: work out that digit and type it (0–9) or click it. Our server fetches the puzzle, keeps the answer and times you,
            so it cannot be read from the page. Under 5 s is GOLD, under 10 s SILVER, slower BRONZE: solving is where all your power comes from.</p>
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
      {trailer && <Trailer onClose={() => setTrailer(false)} />}
    </section>
  );
}
