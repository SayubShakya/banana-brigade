// React hooks that connect components to the game's event bus.
// useBus is the bridge between the two event systems in this game: the engine
// publishes plain events (match ended, puzzle answered…) and React components
// subscribe to them, so neither side imports the other.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';
import { on } from './eventBus.js';

export function useBus(eventName, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(eventName, (payload) => ref.current(payload)), [eventName]);
}

// Re-renders the component whenever one of the events fires.
export function useRefreshOn(...eventNames) {
  const [, setTick] = useState(0);
  for (const name of eventNames) useBus(name, () => setTick((t) => t + 1));
}
