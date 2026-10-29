// Pop-up notices for unlocked achievements and for errors. They come from the event
// bus: achievements from an HTTP reply or the WebSocket during an online match,
// errors from api.js when the server cannot be reached or has a fault.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useState } from 'react';
import { useBus } from '../hooks.js';
import { Icon } from './common.jsx';

export default function Toasts() {
  const [items, setItems] = useState([]);
  const show = (item, ms) => {
    const key = `${item.id ?? 'err'}-${Date.now()}-${Math.random()}`;
    // The same error twice in a row (e.g. several calls failing at once) is shown once.
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
