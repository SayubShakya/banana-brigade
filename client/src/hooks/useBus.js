// useBus.js: React hooks that connect components to the event bus.
import { useEffect, useRef, useState } from 'react';
import { on } from '../services/eventBus.js';

/**
 * useBus: subscribe a component to an event bus event while it is mounted.
 * @param {string} eventName  the event to listen for.
 * @param {Function} handler  called with the payload.
 * The handler is kept in a ref so it always sees fresh state, while the subscription
 * itself is only made once per event name; on() returns the unsubscribe cleanup.
 */
export function useBus(eventName, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(eventName, (payload) => ref.current(payload)), [eventName]);
}

/** useRefreshOn: re-render the component whenever any of the given events is emitted. */
export function useRefreshOn(...eventNames) {
  const [, setTick] = useState(0);
  for (const name of eventNames) useBus(name, () => setTick((t) => t + 1));
}
