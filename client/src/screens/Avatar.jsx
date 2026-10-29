// Avatar customiser: headgear, uniform, skin, goggles and face (stubble, beard, moustache), with a live preview
// that cycles through the weapons and the jetpack.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef } from 'react';
import { PARTS, DEFAULT_AVATAR, makeAvatar, drawSoldier } from '../game/characters.js';
import { WEAPONS } from '../game/config.js';
import { Panel } from '../components/common.jsx';

const WEAPON_KEYS = Object.keys(WEAPONS);
const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

function Swatches({ values, current, onPick, label }) {
  return (
    <div className="swatches">
      {values.map((v) => {
        const value = typeof v === 'object' ? v.id : v;
        const colour = typeof v === 'object' ? v.main : v;
        return (
          <button key={value} type="button" className={`swatch${value === current ? ' selected' : ''}${colour ? '' : ' text'}`}
            style={colour ? { background: colour } : undefined} title={label(v)} aria-label={label(v)} aria-pressed={value === current}
            onClick={() => onPick(value)}>
            {colour ? null : v.name}
          </button>
        );
      })}
    </div>
  );
}

// Animated preview drawn on a canvas each frame.
function Preview({ parts, weaponLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    let t = 0;
    let last = null;   // the first frame's time (frame times can be earlier than performance.now())
    const avatar = makeAvatar(parts);
    const draw = (now) => {
      t += last === null ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const c = ref.current;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.scale(c.width / 90, c.height / 110);
      const weapon = WEAPON_KEYS[Math.floor(t / 2) % WEAPON_KEYS.length];
      const flying = Math.floor(t / 4) % 2 === 1;
      drawSoldier(ctx, {
        x: 31, y: 40 + (flying ? -8 + Math.sin(t * 3) * 3 : 0), w: 28, h: 50, facing: 1,
        aim: Math.sin(t * 1.3) * 0.6, walkPhase: t * 9, onGround: !flying, jetting: flying, weapon, hurtFlash: 0,
      }, avatar, t);
      ctx.restore();
      weaponLabel.current.textContent = WEAPONS[weapon].name;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [parts, weaponLabel]);
  return <canvas id="avatar-preview" ref={ref} width={270} height={330} aria-label="Avatar preview" />;
}

export default function Avatar({ name, parts, setParts, onBack }) {
  const weaponLabel = useRef(null);
  const pick = (key) => (value) => setParts({ ...parts, [key]: value });
  return (
    <Panel wide title="Avatar" subtitle="Build your soldier. It is saved on this device." footer={<>
      <button className="mbtn ghost" onClick={() => setParts({
        hat: randomOf(PARTS.hat).id, uniform: randomOf(PARTS.uniform).id, skin: randomOf(PARTS.skin), goggles: randomOf(PARTS.goggles), face: randomOf(PARTS.face).id,
      })}>Randomise</button>
      <button className="mbtn ghost" onClick={() => setParts({ ...DEFAULT_AVATAR })}>Reset</button>
      <button className="mbtn primary" onClick={onBack}>Done</button>
    </>}>
      <div className="avatar-layout">
        <div className="avatar-stage">
          <div className="avatar-name">{name}</div>
          <Preview parts={parts} weaponLabel={weaponLabel} />
          <div className="avatar-weapon" ref={weaponLabel} />
        </div>
        <div className="avatar-options">
          <div className="opt-group"><h4>Headgear</h4><Swatches values={PARTS.hat} current={parts.hat} onPick={pick('hat')} label={(v) => v.name} /></div>
          <div className="opt-group"><h4>Uniform</h4><Swatches values={PARTS.uniform} current={parts.uniform} onPick={pick('uniform')} label={(v) => v.name} /></div>
          <div className="opt-group"><h4>Skin</h4><Swatches values={PARTS.skin} current={parts.skin} onPick={pick('skin')} label={() => 'Skin tone'} /></div>
          <div className="opt-group"><h4>Goggles</h4><Swatches values={PARTS.goggles} current={parts.goggles} onPick={pick('goggles')} label={() => 'Goggles colour'} /></div>
          <div className="opt-group"><h4>Face</h4><Swatches values={PARTS.face} current={makeAvatar(parts).face} onPick={(face) => setParts({ ...parts, face, beard: undefined })} label={(v) => v.name} /></div>
        </div>
      </div>
    </Panel>
  );
}
