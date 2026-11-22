// Cutscene.jsx: the full-screen story clip player.
// It registers itself with cutsceneBridge, so playCutscene() anywhere can show a clip here.
import { useCallback, useEffect, useRef, useState } from 'react';
import { registerCutscenePlayer } from '../services/cutsceneBridge.js';

// Timings: show the still image if the video has not started after 2.5 s; never play longer
// than 9 s; a still image shows for 2 s; ignore keys pressed in the first 250 ms.
const LOAD_TIMEOUT_MS = 2500;
const MAX_MS = 9000;
const STILL_MS = 2000;
const KEY_GRACE_MS = 250;

/**
 * Cutscene: no props. While a clip request is active it renders the video (or a still poster
 * in calm mode / on error), a caption and a Skip button.
 * Any key, a click on the picture, or Skip resolves the request with 'skipped';
 * the video ending or the time limit resolves it with 'ended'.
 */
export default function Cutscene() {
  const [req, setReq] = useState(null);
  const [still, setStill] = useState(false);
  const skipRef = useRef(null);
  const videoRef = useRef(null);
  const openedAt = useRef(0);
  const returnFocus = useRef(null);

  // Register the player: each request becomes a Promise that resolves when the clip closes.
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

  // When the clip closes, give keyboard focus back to where it was.
  useEffect(() => {
    if (req) return;
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back && document.contains(back)) back.focus?.({ preventScroll: true });
  }, [req]);

  // Start the video muted (browsers block autoplay with sound); fall back to the still image.
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
