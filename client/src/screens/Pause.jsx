// Pause menu over the frozen battle.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel } from './common.jsx';

export default function Pause({ sound, onResume, onToggleSound, onEnd, onQuit }) {
  return (
    <Panel narrow dim title="Paused">
      <button className="mbtn primary" onClick={onResume}>Resume</button>
      <button className="mbtn" onClick={onToggleSound}>Sound: {sound ? 'On' : 'Off'}</button>
      <button className="mbtn" onClick={onEnd}>End battle</button>
      <button className="mbtn ghost" onClick={onQuit}>Quit to menu</button>
    </Panel>
  );
}
