// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { MODES } from '../game/config.js';
import { Panel, Icon } from '../components/common.jsx';
import { Stars } from './Campaign.jsx';
import { missionById } from '../game/campaign.js';
import '../styles/banana-meter.css';

const fmtTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
const PURPOSES = [['deploy', 'Deploy'], ['respawn', 'Respawn'], ['crate', 'Crates']];
const MEDALS = [['gold', 'GOLD'], ['silver', 'SILVER'], ['bronze', 'BRONZE']];

export function bananaReport(s) {
  const solved = s.solved ?? 0;
  const attempts = s.attempts ?? 0;
  const timed = s.timed ?? 0;
  return {
    solved, attempts,
    accuracy: attempts ? `${Math.round((solved / attempts) * 100)}%` : '—',
    average: timed ? `${(s.solveMs / timed / 1000).toFixed(1)} s` : '—',
    best: s.best ?? 0,
    grades: { gold: 0, silver: 0, bronze: 0, ...s.grades },
    live: s.sources?.live ?? 0,
    reserve: s.sources?.reserve ?? 0,
    drops: s.drops ?? 0,
  };
}

function BananaReport({ s }) {
  const r = bananaReport(s);
  return (
    <section className="banana-report" aria-label="Banana report">
      <h3>Banana report</h3>
      <dl>
        <div><dt>Puzzles solved</dt><dd>{r.solved} / {r.attempts}</dd></div>
        <div><dt>Accuracy</dt><dd>{r.accuracy}</dd></div>
        <div><dt>Average solve time</dt><dd>{r.average}</dd></div>
        <div><dt>Best streak</dt><dd>{r.best}</dd></div>
        <div><dt>Speed medals</dt><dd className="medals">{MEDALS.map(([k, label]) => <span key={k} className="grade-badge" data-grade={k}>{label} {r.grades[k]}</span>)}</dd></div>
        <div><dt>Live / reserve puzzles</dt><dd>{r.live} / {r.reserve}</dd></div>
        <div><dt>Supply drops called</dt><dd>{r.drops}</dd></div>
      </dl>
    </section>
  );
}

export default function Results({ game, me, onMenu, onAgain, onMission, onMap }) {
  const mission = game.mission;
  const [camp, setCamp] = useState(null);
  const { result, outcome, session: s, durationS } = game;
  const [saved, setSaved] = useState(game.online
    ? { state: 'ok', text: 'Online match: the server saved every player\'s score.' }
    : { state: '', text: result.mode === 'training' ? '' : 'Saving your score…' });

  useEffect(() => {
    if (mission) {
      api.campaignResult({ powers: [...(game.session?.powers ?? [])], mission: mission.id, won: outcome.won, kills: result.player.kills, deaths: result.player.deaths, continues: result.continues ?? 0, timeS: Math.min(3600, durationS) })
        .then((r) => { setCamp(r); setSaved({ state: 'ok', text: r.unlockedNext ? `Mission ${mission.id + 1} unlocked!` : 'Progress saved.' }); })
        .catch((err) => setSaved({ state: 'error', text: `Progress not saved: ${err.message}` }));
      return;
    }
    if (game.online || result.mode === 'training') return;
    api.saveScore({
      mode: result.mode, kills: result.player.kills, deaths: result.player.deaths,
      wave: result.wave, won: outcome.won, durationS: Math.min(3600, durationS), difficulty: game.difficulty,
      powers: [...(game.session?.powers ?? [])],
    })
      .then(() => setSaved({ state: 'ok', text: `Score saved to ${me}'s record.` }))
      .catch((err) => setSaved({ state: 'error', text: `Score not saved: ${err.message}` }));
  }, [game]);

  return (
    <Panel wide title={outcome.title} chip={<span className="mode-chip">{mission ? `Mission ${mission.id}` : MODES[result.mode].name}{game.difficulty && result.mode !== 'training' ? ` · ${game.difficulty}` : ''}</span>} footer={mission ? <>
      <button className="mbtn ghost" onClick={onMenu}>Menu</button>
      <button className="mbtn ghost" onClick={onMap}>Mission map</button>
      {(() => {
        const next = camp && missionById(mission.id + 1) && (camp.unlockedNext || camp.progress[mission.id]?.stars > 0);
        return <>
          <button className={`mbtn ${next ? 'ghost' : 'primary'}`} onClick={() => onMission(mission)}>Retry</button>
          {next && <button className="mbtn primary" onClick={() => onMission(missionById(mission.id + 1))}>Next mission</button>}
        </>;
      })()}
    </> : <>
      <button className="mbtn ghost" onClick={onMenu}>Menu</button>
      <button className="mbtn primary" onClick={onAgain}>{game.online ? 'Back to the room' : 'Deploy again'}</button>
    </>}>
      <p className="results-reason">{outcome.line}</p>
      {mission && (
        <div className="mission-stars">
          <Stars big n={camp?.stars ?? 0} />
          <span>{!camp ? 'Counting stars…' : camp.stars === 3 ? 'Perfect mission!' : camp.stars === 0 ? 'No stars this time. Try again!' : `Best so far: ${camp.best} ★`}</span>
        </div>
      )}
      <div className="result-cards">
        <div className="result-card"><Icon id="banana" className="ico big" /><b>{s.solved} / {s.attempts}</b><span>Puzzles solved</span></div>
        <div className="result-card"><b>{s.attempts ? `${Math.round((s.solved / s.attempts) * 100)}%` : '—'}</b><span>Accuracy</span></div>
        <div className="result-card"><b>{s.best}</b><span>Best streak</span></div>
        <div className="result-card"><b>{fmtTime(durationS)}</b><span>Time in battle</span></div>
      </div>
      <div className="purpose-row" aria-label="Puzzles by type">
        {PURPOSES.map(([k, label]) => <div key={k}>{label}<b>{s.byPurpose[k].solved} / {s.byPurpose[k].attempts}</b></div>)}
      </div>
      <BananaReport s={s} />
      {result.mode !== 'training' && <table className="results">
        <thead><tr><th>#</th><th>Soldier</th><th>Kills</th><th>Deaths</th></tr></thead>
        <tbody>
          {result.ranking.map((r, i) => (
            <tr key={r.id} className={r.isPlayer ? 'me' : ''}>
              <td>{i + 1}</td><td>{r.name}{(result.mode === 'team' || result.teamMode) && <> <small className={`team-${r.team}`}>{r.team}</small></>}</td><td>{r.kills}</td><td>{r.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>}
      <p className="results-saved" data-state={saved.state}>{saved.text}</p>
    </Panel>
  );
}
