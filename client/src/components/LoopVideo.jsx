// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';

const calm = () => document.body.classList.contains('a11y-calm') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function LoopVideo({ name, className = '', label }) {
  const ref = useRef(null);
  const [still] = useState(calm);
  const src = `/media/loops/${name}`;
  useEffect(() => {
    const v = ref.current;
    if (v && !still) v.play().catch(() => {});
  }, [still, name]);
  if (still) return <img className={`loop-video ${className}`} src={`${src}.jpg`} alt={label ?? ''} aria-hidden={!label} />;
  return (
    <video ref={ref} className={`loop-video ${className}`} src={`${src}.mp4`} poster={`${src}.jpg`}
      muted loop playsInline autoPlay preload="metadata" aria-hidden={!label} aria-label={label} />
  );
}
