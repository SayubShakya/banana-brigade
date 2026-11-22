// eventBus.js: a tiny publish/subscribe event bus (event-driven programming theme).
// Parts of the app that do not know each other communicate by event name:
// one side calls emit('name', data), any number of listeners registered with on() react.
// listeners: event name -> Set of handler functions.
const listeners = new Map();

/**
 * on: subscribe a handler to an event.
 * @param {string} eventName  e.g. 'toast:error', 'game:over'.
 * @param {Function} handler  called with the event payload.
 * @returns {Function} an unsubscribe function (handy as a React effect cleanup).
 */
export function on(eventName, handler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => off(eventName, handler);
}

/** off: remove a handler that was added with on(). */
export function off(eventName, handler) {
  listeners.get(eventName)?.delete(handler);
}

/**
 * emit: call every handler subscribed to eventName with the payload.
 * Each handler runs inside try/catch so one broken listener cannot stop the others.
 */
export function emit(eventName, payload) {
  for (const handler of listeners.get(eventName) ?? []) {
    try {
      handler(payload);
    } catch (err) {
      console.error(`Error in "${eventName}" listener`, err);
    }
  }
}
