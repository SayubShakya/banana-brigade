// The campaign map: 3 chapters of 3 missions on a path. Each node shows its stars;
// locked missions show what they need. Picking a mission opens its briefing.
// Unlocking is checked again by the server when a result is saved.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { CHAPTERS, MISSIONS, isUnlocked, totalStars } from '../game/campaign.js';
import { DIFFICULTY } from '../game/config.js';
import { mapName } from '../game/maps.js';
import { Panel, Icon } from './common.jsx';

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const Stars = ({ n, big = false }) => (
  <span className={`stars${big ? ' big' : ''}`} aria-label={`${n} of 3 stars`}>{[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''}>★</i>)}</span>
);
export { Stars };

export default function Campaign({ onPlay, onBack }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    api.campaign().then((r) => {
      setProgress(r.progress);
      // Start with the first mission that still has stars to earn.
      setPicked(MISSIONS.find((m) => isUnlocked(m, r.progress) && (r.progress[m.id]?.stars ?? 0) < 3) ?? MISSIONS[0]);
    }).catch((e) => setError(e.message));
  }, []);

  const stars = totalStars(progress);
  const p = picked && progress?.[picked.id];
  const open = picked && progress && isUnlocked(picked, progress);
  const chapter = picked && CHAPTERS.find((c) => c.id === picked.chapter);

  return (
    <Panel wide title="Campaign" chip={<span className="mode-chip">★ {stars} / {MISSIONS.length * 3}</span>}
      subtitle="Reach the kill target before time runs out. Earn up to 3 stars per mission to unlock new chapters."
      footer={<button className="mbtn ghost" onClick={onBack}>Back</button>}>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <div className="campaign">
        <div className="map">
          {CHAPTERS.map((c) => {
            const chapterOpen = stars >= c.needStars;
            return (
              <section key={c.id} className={`chapter ${c.difficulty}${chapterOpen ? '' : ' locked'}`}>
                <header><b>Chapter {c.id} · {c.name}</b><span className={`level-tag ${c.difficulty}`}>{DIFFICULTY[c.difficulty].name}</span>
                  {!chapterOpen && <span className="need"><Icon id="lock" />Need {c.needStars} ★</span>}</header>
                <div className="path">
                  {MISSIONS.filter((m) => m.chapter === c.id).map((m) => {
                    const unlocked = progress && isUnlocked(m, progress);
                    const done = (progress?.[m.id]?.stars ?? 0) > 0;
                    return (
                      <button key={m.id} className={`node${done ? ' done' : unlocked ? ' current' : ' locked'}${picked?.id === m.id ? ' picked' : ''}`} onClick={() => setPicked(m)}>
                        <span className="dot">{unlocked ? m.id : <Icon id="lock" />}</span>
                        <span className="node-name">{m.name}</span>
                        <Stars n={progress?.[m.id]?.stars ?? 0} />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        {picked && (
          <aside className="briefing">
            <small>Mission {picked.id} · {chapter.name}</small>
            <h3>{picked.name}</h3>
            <p>{picked.text}</p>
            <ul className="brief-facts">
              <li><b>{picked.target}</b> kills to win</li>
              <li><b>{fmt(picked.timeLimit)}</b> time limit</li>
              <li><b>{mapName(picked.map)}</b> map</li>
              <li><b>{'♥'.repeat(picked.lives)}</b> lives</li>
              <li><b>{picked.bots}</b> {DIFFICULTY[chapter.difficulty].name.toLowerCase()} bots</li>
            </ul>
            <div className="star-rules">
              <div><Stars n={1} /> Complete the mission</div>
              <div><Stars n={2} /> …without a Banana continue</div>
              <div><Stars n={3} /> …and solve every Banana puzzle</div>
            </div>
            {p && <p className="best">Best: <Stars n={p.stars} />{p.bestS ? ` in ${fmt(p.bestS)}` : ''}</p>}
            {open
              ? <button className="mbtn primary" onClick={() => onPlay(picked)}><Icon id="banana" />Deploy</button>
              : <p className="locked-note"><Icon id="lock" />{stars < chapter.needStars ? `Earn ${chapter.needStars} ★ to open ${chapter.name}.` : `Complete mission ${picked.id - 1} first.`}</p>}
          </aside>
        )}
      </div>
    </Panel>
  );
}
