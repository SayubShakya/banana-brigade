// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

export default function BattleLog({ match }) {
  if (!match) return null;
  return (
    <section className="battle-log" aria-label="Battle log">
      <ol>{match.roster.map((r, i) => <li key={i}>{r.name}: {r.kills} / {r.deaths}</li>)}</ol>
      <ul>{match.log.map((e, i) => <li key={i}>{e.t}s {e.type} {[e.by, e.target, e.weapon, e.detail].filter(Boolean).join(' ')}</li>)}</ul>
    </section>
  );
}
