// A tiny publish/subscribe event bus (observer pattern).
// Game logic emits events such as "answer:correct"; UI parts subscribe to them.
// The emitter does not need to know who is listening, which keeps parts decoupled.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

const listeners = new Map();

export function on(eventName, handler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => off(eventName, handler); // call the returned function to unsubscribe
}

export function off(eventName, handler) {
  listeners.get(eventName)?.delete(handler);
}

export function emit(eventName, payload) {
  for (const handler of listeners.get(eventName) ?? []) {
    try {
      handler(payload);
    } catch (err) {
      // One broken listener must not stop the others.
      console.error(`Error in "${eventName}" listener`, err);
    }
  }
}
