// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useCallback, useEffect, useRef, useState } from 'react';
import { registerCutscenePlayer } from '../services/cutsceneBridge.js';

const LOAD_TIMEOUT_MS = 2500;
const MAX_MS = 9000;
const STILL_MS = 2000;
const KEY_GRACE_MS = 250;

export default function Cutscene() {
  const [req, setReq] = useState(null);
  const [still, setStill] = useState(false);
  const skipRef = useRef(null);
  const videoRef = useRef(null);
  const openedAt = useRef(0);
  const returnFocus = useRef(null);

  useEffect(() => registerCutscenePlayer((clip) => new Promise((resolve) => {
    openedAt.current = performance.now();
    returnFocus.current = document.activeElement;
    setStill(clip.calm);
    setReq({ ...clip, resolve });
  })), []);

  const close = useCallback((how) => {
    setReq((r) => { r?.resolve(how); return null; });
  }, []);

  useEffect(() => {
    if (!req) return undefined;
    skipRef.current?.focus({ preventScroll: true });
    const timers = [setTimeout(() => close('ended'), still ? STILL_MS : MAX_MS)];
    if (!still) timers.push(setTimeout(() => { if (!(videoRef.current?.currentTime > 0)) setStill(true); }, LOAD_TIMEOUT_MS));
    const onKey = (e) => {
      if (e.repeat || performance.now() - openedAt.current < KEY_GRACE_MS) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close('skipped');
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [req, still, close]);

  useEffect(() => {
    if (req) return;
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back && document.contains(back)) back.focus?.({ preventScroll: true });
  }, [req]);

  useEffect(() => {
    const v = videoRef.current;
    if (!req || still || !v) return;
    v.muted = true;
    v.play()?.catch(() => setStill(true));
  }, [req, still]);

  if (!req) return null;
  return (
    <div className={`cutscene${still ? ' still' : ''}`} role="dialog" aria-modal="true" aria-label={`Story clip: ${req.caption}`}
      onPointerDown={(e) => { if (e.target === e.currentTarget || e.target.tagName === 'VIDEO' || e.target.tagName === 'IMG') close('skipped'); }}>
      {still
        ? <img className="cutscene-media" src={req.poster} alt="" onError={() => close('ended')} />
        : <video ref={videoRef} className="cutscene-media" src={req.src} poster={req.poster} muted playsInline autoPlay preload="auto"
            aria-hidden="true" onEnded={() => close('ended')} onError={() => setStill(true)} />}
      <p className="cutscene-caption" aria-live="polite">{req.caption}</p>
      <button ref={skipRef} type="button" className="cutscene-skip" onClick={() => close('skipped')}>Skip ▸</button>
    </div>
  );
}
