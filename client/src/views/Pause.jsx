// Pause.jsx: the pause menu shown over the battle (Esc).
import { Panel } from '../components/common.jsx';
import { toggleFullscreen, useFullscreen } from '../services/fullscreen.js';

/**
 * Pause: Resume, sound, fullscreen, end battle and quit buttons.
 * @param {{sound, online, canEnd, onResume, onToggleSound, onEnd, onQuit}} props
 * In online games the match keeps running, and only the host can end it for everyone.
 */
export default function Pause({ sound, online, canEnd, onResume, onToggleSound, onEnd, onQuit }) {
  const [isFullscreen, canFullscreen] = useFullscreen();
  return (
    <Panel narrow dim title={online ? 'Menu' : 'Paused'} subtitle={online ? 'The online match keeps going while this is open.' : undefined}>
      <button className="mbtn primary" onClick={onResume}>Resume</button>
      <button className="mbtn" aria-pressed={!sound} onClick={onToggleSound}>Sound: {sound ? 'On' : 'Muted'}</button>
      {canFullscreen && <button className="mbtn" aria-pressed={isFullscreen} onClick={toggleFullscreen}>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>}
      {canEnd && <button className="mbtn" onClick={onEnd}>{online ? 'End match for everyone' : 'End battle'}</button>}
      <button className="mbtn ghost" onClick={onQuit}>{online ? 'Leave match (a bot takes over)' : 'Quit to menu'}</button>
    </Panel>
  );
}
