// Pause menu over the frozen battle.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel } from '../components/common.jsx';
import { toggleFullscreen, useFullscreen } from '../lib/fullscreen.js';

export default function Pause({ sound, online, onResume, onToggleSound, onEnd, onQuit }) {
  const [isFullscreen, canFullscreen] = useFullscreen();
  return (
    <Panel narrow dim title={online ? 'Menu' : 'Paused'} subtitle={online ? 'The online match keeps going while this is open.' : undefined}>
      <button className="mbtn primary" onClick={onResume}>Resume</button>
      <button className="mbtn" aria-pressed={!sound} onClick={onToggleSound}>Sound: {sound ? 'On' : 'Muted'}</button>
      {canFullscreen && <button className="mbtn" aria-pressed={isFullscreen} onClick={toggleFullscreen}>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>}
      {!online && <button className="mbtn" onClick={onEnd}>End battle</button>}
      <button className="mbtn ghost" onClick={onQuit}>{online ? 'Leave match (a bot takes over)' : 'Quit to menu'}</button>
    </Panel>
  );
}
