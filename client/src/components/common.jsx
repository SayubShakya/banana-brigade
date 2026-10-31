// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef } from 'react';
import { drawAvatarPreview, makeAvatar } from '../game/characters.js';

export const Rank = ({ n }) => (n <= 3 ? <span className={`medal m${n}`}>{n}</span> : n);

const INLINE = {
  clock: <><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M12 7v5l3.5 2.5M3 4.5 5.5 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></>,
};

export const Icon = ({ id, className = 'ico' }) => (
  <svg className={className} aria-hidden="true" focusable="false" viewBox={INLINE[id] ? '0 0 24 24' : undefined}>{INLINE[id] ?? <use href={`#i-${id}`} />}</svg>
);

export function AvatarCanvas({ parts, width = 180, height = 240, ...rest }) {
  const ref = useRef(null);
  useEffect(() => { drawAvatarPreview(ref.current, makeAvatar(parts)); }, [parts]);
  return <canvas ref={ref} width={width} height={height} {...rest} />;
}

export function RankCard({ rank, big = false }) {
  const pct = rank.next ? ((rank.xp - rank.floor) / (rank.next - rank.floor)) * 100 : 100;
  return (
    <div className={`rank-card${big ? ' big' : ''}`} aria-label="Your rank">
      <Icon id="chevron" className="rank-ico" />
      <div className="rank-text">
        <b>{rank.name}</b>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${Math.max(2, pct)}%` }} />
          <span>{rank.next ? `${rank.xp.toLocaleString()} / ${rank.next.toLocaleString()} XP` : `${rank.xp.toLocaleString()} XP · top rank`}</span>
        </div>
      </div>
    </div>
  );
}

export function Panel({ title, subtitle, wide, narrow, dim, children, footer, chip }) {
  return (
    <section className={`screen panel-screen${dim ? ' dim' : ''}`}>
      <div className={`panel${wide ? ' wide' : ''}${narrow ? ' narrow' : ''}`}>
        <header className="panel-head">{chip}<h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</header>
        {children}
        {footer && <footer className="panel-foot">{footer}</footer>}
      </div>
    </section>
  );
}

export const Sky = () => (
  <>
    <div className="sky-clouds" aria-hidden="true"><i /><i /><i /></div>
    <div className="menu-ground" aria-hidden="true" />
  </>
);

export function Skeleton({ rows = 3, height }) {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton-row" style={height ? { height } : undefined} />)}
    </div>
  );
}
export const SkeletonRows = ({ cols, rows = 3 }) => Array.from({ length: rows }, (_, i) => (
  <tr key={`sk${i}`} aria-hidden={i > 0}><td colSpan={cols}><div className="skeleton-row" role={i === 0 ? 'status' : undefined} aria-label={i === 0 ? 'Loading' : undefined} /></td></tr>
));
