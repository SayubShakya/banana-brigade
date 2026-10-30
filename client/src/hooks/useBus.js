// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { useEffect, useRef, useState } from 'react';
import { on } from '../services/eventBus.js';

export function useBus(eventName, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(eventName, (payload) => ref.current(payload)), [eventName]);
}

export function useRefreshOn(...eventNames) {
  const [, setTick] = useState(0);
  for (const name of eventNames) useBus(name, () => setTick((t) => t + 1));
}
