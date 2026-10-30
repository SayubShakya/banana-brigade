// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

const listeners = new Map();

export function on(eventName, handler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => off(eventName, handler);
}

export function off(eventName, handler) {
  listeners.get(eventName)?.delete(handler);
}

export function emit(eventName, payload) {
  for (const handler of listeners.get(eventName) ?? []) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`Error in "${eventName}" listener`, err);
    }
  }
}
