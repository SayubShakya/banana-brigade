// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { emit } from '../services/eventBus.js';
import { Panel, Rank, Icon, Skeleton } from '../components/common.jsx';

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

export default function Daily({ me, onBack }) {
  const [info, setInfo] = useState(null);
  const [board, setBoard] = useState([]);
  const [run, setRun] = useState(null);
  const [left, setLeft] = useState(20);
  const [msg, setMsg] = useState({ text: '', kind: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const deadline = useRef(0);

  const refresh = useCallback(() => {
    api.daily().then(setInfo).catch((e) => setError(e.message));
    api.dailyBoard().then((b) => setBoard(b.rows)).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const showPuzzle = (p, seconds) => { deadline.current = performance.now() + seconds * 1000; setLeft(seconds); setRun((r) => ({ ...r, ...p })); };

  async function start() {
    setError('');
    setBusy(true);
    try {
      if (info?.running) {
        const r = await api.dailyCurrent();
        setRun({ total: r.total, score: r.score, solved: r.solved, bonus: r.bonus, finished: false });
        showPuzzle({ index: r.index, image: r.image }, r.seconds);
        return;
      }
      const s = await api.dailyStart();
      setRun({ total: s.total, score: 0, solved: 0, bonus: 1, finished: false });
      showPuzzle({ index: s.index, image: s.image }, s.seconds);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const answer = useCallback(async (n) => {
    if (!run || run.finished || busy) return;
    setBusy(true);
    try {
      const r = await api.dailyAnswer(n);
      emit('banana:answered', { purpose: 'daily', correct: r.correct });
      setMsg(r.correct ? { text: `Correct! +${r.score - run.score} points`, kind: 'good' } : { text: n < 0 ? `Time is up: it was ${r.solution}.` : `Not quite: it was ${r.solution}.`, kind: 'bad' });
      if (r.finished) {
        setRun((x) => ({ ...x, score: r.score, solved: r.solved, finished: true, streak: r.streak }));
        refresh();
      } else {
        setRun((x) => ({ ...x, score: r.score, solved: r.solved, bonus: r.bonus }));
        showPuzzle(r.next, info?.seconds ?? 20);
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [run, busy, info, refresh]);

  useEffect(() => {
    if (!run || run.finished) return undefined;
    const id = setInterval(() => {
      const s = Math.max(0, (deadline.current - performance.now()) / 1000);
      setLeft(s);
      if (s <= 0) answer(-1);
    }, 200);
    const onKey = (e) => { if (/^(Digit|Numpad)[0-9]$/.test(e.code)) answer(Number(e.code.slice(-1))); };
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(id); window.removeEventListener('keydown', onKey); };
  }, [run, answer]);

  const playing = run && !run.finished;
  return (
    <Panel wide title="Daily Banana Challenge" chip={<span className="mode-chip">{info?.date ?? 'Today'}</span>}
      subtitle="The same 5 Banana puzzles for everyone today. 20 seconds each, one attempt. Points double for every correct answer in a row."
      footer={<button className="mbtn primary" onClick={onBack} disabled={playing}>{playing ? 'Finish the challenge first' : 'Back'}</button>}>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {!info && !error && <Skeleton rows={3} height="8cqh" />}
      {playing ? (
        <div className="daily-play">
          <div className="puzzle-img-wrap" data-state="ready"><img id="puzzle-img" src={run.image} alt="Banana API puzzle" /></div>
          <div className="puzzle-side">
            <div className="daily-stats"><span>Puzzle <b>{run.index + 1} / {run.total}</b></span><span>Score <b>{run.score}</b></span><span>Next ×<b>{run.bonus}</b></span><span className={left < 6 ? 'low' : ''}><b>{Math.ceil(left)}</b> s</span></div>
            <p id="puzzle-status" data-kind={msg.kind}>{msg.text || 'Enter the digit hidden by the banana.'}</p>
            <div className="keypad">
              {DIGITS.map((d) => <button key={d} className={d === 0 ? 'zero' : ''} disabled={busy} onClick={() => answer(d)}>{d}</button>)}
            </div>
          </div>
        </div>
      ) : (
        <div className="daily-home">
          <section className="lobby-box">
            {run?.finished ? (
              <div className="daily-result"><Icon id="banana" className="ico big" /><b>{run.score} points</b><span>{run.solved} / {run.total} solved · day streak {run.streak}</span>
                {msg.text && <span className="daily-last" data-kind={msg.kind}>Last puzzle: {msg.text}</span>}</div>
            ) : info?.played && !info.running ? (
              <div className="daily-result"><Icon id="banana" className="ico big" /><b>{info.result.score} points</b><span>Done for today · day streak {info.streak}. Come back tomorrow!</span></div>
            ) : (
              <>
                <div className="daily-result"><Icon id="banana" className="ico big" /><b>Ready?</b><span>Day streak {info?.streak ?? 0} · best {info?.best ?? 0} points</span></div>
                <button className="mbtn primary" onClick={start} disabled={busy || !info}>{info?.running ? 'Continue today\'s challenge' : 'Start today\'s challenge'}</button>
              </>
            )}
          </section>
          <section className="lobby-box">
            <h3 className="sub-head">Today&apos;s leaders</h3>
            <table className="results compact leaderboard">
              <thead><tr><th>#</th><th>Soldier</th><th>Points</th><th>Solved</th></tr></thead>
              <tbody>
                {!board.length && <tr className="empty-row"><td colSpan={4}>Nobody has played today yet.</td></tr>}
                {board.map((r, i) => <tr key={r.username} className={r.username === me ? 'me' : ''}><td><Rank n={i + 1} /></td><td>{r.username}</td><td>{r.score}</td><td>{r.solved} / 5</td></tr>)}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </Panel>
  );
}
