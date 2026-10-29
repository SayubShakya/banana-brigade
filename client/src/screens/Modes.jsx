// "More modes": the bot modes that are not Quick Play, each with what it is for.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { Panel, Icon } from './common.jsx';

const MODES = [
  { mode: 'survival', icon: 'shield', name: 'Survival', text: 'Endless waves of bots. When you go down, only a Banana puzzle brings you back. How many waves can you last?' },
  { mode: 'team', icon: 'team', name: 'Team Battle', text: 'Blue vs Red, you and two bots against three bots. First team to 30 kills wins.' },
  { mode: 'training', icon: 'target', name: 'Training', text: 'A practice range with dummies that do not shoot back. Try every weapon and the jetpack. Not ranked.' },
];

export default function Modes({ onDeploy, onBack }) {
  return (
    <Panel wide title="More Modes" subtitle="Every mode starts with a Banana puzzle: solve it to deploy."
      footer={<button className="mbtn primary" onClick={onBack}>Back</button>}>
      <div className="modes-list">
        {MODES.map((m) => (
          <button key={m.mode} className="mode-card" onClick={() => onDeploy(m.mode)}>
            <Icon id={m.icon} className="mode-ico" />
            <span className="mode-text"><b>{m.name}</b><small>{m.text}</small></span>
            <span className="mode-tag"><Icon id="banana" />Deploy</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
