// Pause menu over the frozen battle.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel } from './common.jsx';

export default function Pause({ sound, online, onResume, onToggleSound, onEnd, onQuit }) {
  return (
    <Panel narrow dim title={online ? 'Menu' : 'Paused'} subtitle={online ? 'The online match keeps going while this is open.' : undefined}>
      <button className="mbtn primary" onClick={onResume}>Resume</button>
      <button className="mbtn" aria-pressed={!sound} onClick={onToggleSound}>Sound: {sound ? 'On' : 'Muted'}</button>
      {!online && <button className="mbtn" onClick={onEnd}>End battle</button>}
      <button className="mbtn ghost" onClick={onQuit}>{online ? 'Leave match (a bot takes over)' : 'Quit to menu'}</button>
    </Panel>
  );
}
