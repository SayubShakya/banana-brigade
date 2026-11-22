// Toasts.jsx: small pop-up messages in the corner of the screen.
import { useState } from 'react';
import { useBus } from '../hooks/useBus.js';
import { Icon } from './common.jsx';

/**
 * Toasts: no props. Listens to three event bus events and shows a toast for each:
 * 'achievement:unlocked' (trophy), 'toast:error' (error, e.g. from api.js) and 'toast:info'.
 * Each toast removes itself after a few seconds; identical errors are not repeated.
 */
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
