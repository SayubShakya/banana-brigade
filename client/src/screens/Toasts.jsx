// Pop-up notices for unlocked achievements. They come from the event bus, whether
// the unlock arrived in an HTTP reply or over the WebSocket during an online match.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { useBus } from '../hooks.js';
import { Icon } from './common.jsx';

export default function Toasts() {
  const [items, setItems] = useState([]);
  useBus('achievement:unlocked', (a) => {
    const key = `${a.id}-${Date.now()}`;
    setItems((list) => [...list, { ...a, key }]);
    setTimeout(() => setItems((list) => list.filter((x) => x.key !== key)), 4500);
  });
  return (
    <div className="toasts" aria-live="polite">
      {items.map((a) => (
        <div key={a.key} className="toast">
          <Icon id="trophy" className="ico big" />
          <div><small>Achievement unlocked</small><b>{a.name}</b><span>{a.text}</span></div>
        </div>
      ))}
    </div>
  );
}
