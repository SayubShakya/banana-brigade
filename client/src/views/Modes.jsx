// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { Panel, Icon } from '../components/common.jsx';

const MODES = [
  { mode: 'tutorial', icon: 'helmet', name: 'Boot Camp', text: 'A 90-second guided drill: move, fly, shoot, grab a gun, open a banana crate and pick a power. Skip or replay any time.', free: true },
  { mode: 'survival', icon: 'shield', name: 'Survival', text: 'Endless waves of bots. When you go down, only a Banana puzzle brings you back. How many waves can you last?' },
  { mode: 'team', icon: 'team', name: 'Team Battle', text: 'Blue vs Red, you and two bots against three bots. First team to 30 kills wins.' },
  { mode: 'training', icon: 'target', name: 'Training', text: 'A practice range with dummies that do not shoot back. Try every weapon and the jetpack. No puzzle to start, not ranked.', free: true },
];

export default function Modes({ onDeploy, onBack }) {
  return (
    <Panel wide title="More Modes" subtitle="Battle modes start with a Banana puzzle. Boot Camp and Training drop you straight in."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="modes-list">
        {MODES.map((m) => (
          <button key={m.mode} className="mode-card" onClick={() => onDeploy(m.mode)}>
            <Icon id={m.icon} className="mode-ico" />
            <span className="mode-text"><b>{m.name}</b><small>{m.text}</small></span>
            <span className="mode-tag">{m.free ? 'Start' : <><Icon id="banana" />Deploy</>}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
