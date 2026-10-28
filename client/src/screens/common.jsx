// Small pieces shared by several screens.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef } from 'react';
import { drawAvatarPreview, makeAvatar } from '../game/characters.js';

// Position in a leaderboard: medals for the top three, a plain number after that.
export const Rank = ({ n }) => (n <= 3 ? <span className={`medal m${n}`}>{n}</span> : n);

export const Icon = ({ id, className = 'ico' }) => <svg className={className}><use href={`#i-${id}`} /></svg>;

// A still picture of the player's soldier.
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
