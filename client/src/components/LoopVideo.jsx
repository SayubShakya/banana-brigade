// LoopVideo.jsx: a small silent looping video (e.g. power card art) from /media/loops.
import { useEffect, useRef, useState } from 'react';

const calm = () => document.body.classList.contains('a11y-calm') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * LoopVideo: plays <name>.mp4 on a loop, or shows <name>.jpg in calm / reduced motion mode.
 * @param {{name: string, className?: string, label?: string}} props  label = accessible text.
 */
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
