// Results: the final ranking, puzzle stats for this deployment, and saving the score.
// In a local game the kills come from this browser, but the server takes the puzzle
// counts from the session, where every answer was checked. In an online match the
// server has already saved everyone's score itself, so nothing is sent from here.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { MODES } from '../game/config.js';
import { Panel, Icon } from './common.jsx';

const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
const PURPOSES = [['deploy', 'Deploy'], ['respawn', 'Respawn'], ['crate', 'Crates']];

export default function Results({ game, me, onMenu, onAgain }) {
  const { result, outcome, session: s, durationS } = game;
  const [saved, setSaved] = useState(game.online
    ? { state: 'ok', text: 'Online match: the server saved every player\'s score.' }
    : { state: '', text: result.mode === 'training' ? '' : 'Saving your score…' });

  useEffect(() => {
    if (game.online || result.mode === 'training') return;
    api.saveScore({
      mode: result.mode, kills: result.player.kills, deaths: result.player.deaths,
      wave: result.wave, won: outcome.won, durationS: Math.min(3600, durationS),
    })
      .then(() => setSaved({ state: 'ok', text: `Score saved to ${me}'s record.` }))
      .catch((err) => setSaved({ state: 'error', text: `Score not saved: ${err.message}` }));
  }, [game]);

  return (
    <Panel wide title={outcome.title} chip={<span className="mode-chip">{MODES[result.mode].name}</span>} footer={<>
      <button className="mbtn ghost" onClick={onMenu}>Menu</button>
      <button className="mbtn primary" onClick={onAgain}>{game.online ? 'Back to the room' : 'Deploy again'}</button>
    </>}>
      <p className="results-reason">{outcome.line}</p>
      <div className="result-cards">
        <div className="result-card"><Icon id="banana" className="ico big" /><b>{s.solved} / {s.attempts}</b><span>Puzzles solved</span></div>
        <div className="result-card"><b>{s.attempts ? `${Math.round((s.solved / s.attempts) * 100)}%` : '—'}</b><span>Accuracy</span></div>
        <div className="result-card"><b>{s.best}</b><span>Best streak</span></div>
        <div className="result-card"><b>{fmtTime(durationS)}</b><span>Time in battle</span></div>
      </div>
      <div className="purpose-row" aria-label="Puzzles by type">
        {PURPOSES.map(([k, label]) => <div key={k}>{label}<b>{s.byPurpose[k].solved} / {s.byPurpose[k].attempts}</b></div>)}
      </div>
      <table className="results">
        <thead><tr><th>#</th><th>Soldier</th><th>Kills</th><th>Deaths</th></tr></thead>
        <tbody>
          {result.ranking.map((r, i) => (
            <tr key={r.id} className={r.isPlayer ? 'me' : ''}>
              <td>{i + 1}</td><td>{r.name}{(result.mode === 'team' || result.teamMode) && <> <small className={`team-${r.team}`}>{r.team}</small></>}</td><td>{r.kills}</td><td>{r.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="results-saved" data-state={saved.state}>{saved.text}</p>
    </Panel>
  );
}
