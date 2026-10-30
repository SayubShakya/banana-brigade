// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { useBus } from '../hooks/useBus.js';
import { Icon } from './common.jsx';

export default function Toasts() {
  const [items, setItems] = useState([]);
  const show = (item, ms) => {
    const key = `${item.id ?? 'err'}-${Date.now()}-${Math.random()}`;
    setItems((list) => (item.error && list.some((x) => x.error && x.text === item.text) ? list : [...list, { ...item, key }]));
    setTimeout(() => setItems((list) => list.filter((x) => x.key !== key)), ms);
  };
  useBus('achievement:unlocked', (a) => show(a, 4500));
  useBus('toast:error', ({ text }) => show({ error: true, text }, 6000));
  useBus('toast:info', ({ text }) => show({ info: true, text }, 4500));
  return (
    <div className="toasts" aria-live="polite">
      {items.map((a) => (a.info ? (
        <div key={a.key} className="toast info" role="status">
          <Icon id="shield" className="ico big" />
          <div><small>Done</small><span>{a.text}</span></div>
        </div>
      ) : a.error ? (
        <div key={a.key} className="toast error" role="alert">
          <Icon id="cross" className="ico big" />
          <div><small>Something went wrong</small><span>{a.text}</span></div>
        </div>
      ) : (
        <div key={a.key} className="toast">
          <Icon id="trophy" className="ico big" />
          <div><small>Achievement unlocked</small><b>{a.name}</b><span>{a.text}</span></div>
        </div>
      )))}
    </div>
  );
}
