// The single Socket.io connection used by the online game and lobby.
// Server events are forwarded to the client event bus (event-driven design).
import { io } from 'socket.io-client';
import { emit } from '../services/eventBus.js';

let socket = null;

/**
 * Returns the shared Socket.io client, creating it the first time and connecting if needed.
 * Forwards server events to the event bus:
 *  - 'achievement:unlocked' -> emit('achievement:unlocked')
 *  - disconnect by the server -> emit('session:ended') so the UI can sign the user out
 */
export function getSocket() {
  if (!socket) {
    // Try WebSocket first, fall back to HTTP long-polling. The session cookie is sent automatically.
    socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
    socket.on('achievement:unlocked', (a) => emit('achievement:unlocked', a));
    socket.on('disconnect', (reason) => { if (reason === 'io server disconnect') emit('session:ended', { text: 'You were signed out by the server (another device, a password change or a suspension).' }); });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

// Closes the connection (for example on logout).
export function closeSocket() {
  socket?.disconnect();
}

/**
 * Sends a Socket.io event and waits for the server's acknowledgement (request/response style).
 * Rejects if the server replies with { error } or does not answer within 8 seconds.
 * @param {string} event the event name
 * @param {*} [data] optional payload
 * @returns {Promise<*>} the server's reply
 */
export function request(event, data) {
  return new Promise((resolve, reject) => {
    const done = (reply) => (reply?.error ? reject(new Error(reply.error)) : resolve(reply));
    if (data === undefined) getSocket().timeout(8000).emit(event, (err, reply) => (err ? reject(new Error('The server did not answer')) : done(reply)));
    else getSocket().timeout(8000).emit(event, data, (err, reply) => (err ? reject(new Error('The server did not answer')) : done(reply)));
  });
}
