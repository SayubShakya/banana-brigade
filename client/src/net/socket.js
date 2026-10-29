// The browser end of the WebSocket. It connects only when the player opens online
// play; the session cookie travels with the connection, so the server knows who it is.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { io } from 'socket.io-client';
import { emit } from '../lib/eventBus.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });
    socket.on('achievement:unlocked', (a) => emit('achievement:unlocked', a));   // unlocked in an online match
    // The server closed this socket on purpose: the account was signed out from
    // another device, its password was reset, or an admin suspended it.
    socket.on('disconnect', (reason) => { if (reason === 'io server disconnect') emit('session:ended', { text: 'You were signed out by the server (another device, a password change or a suspension).' }); });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
}

// Sends a message and waits for the server's reply; a reply with `error` becomes an exception.
export function request(event, data) {
  return new Promise((resolve, reject) => {
    const done = (reply) => (reply?.error ? reject(new Error(reply.error)) : resolve(reply));
    if (data === undefined) getSocket().timeout(8000).emit(event, (err, reply) => (err ? reject(new Error('The server did not answer')) : done(reply)));
    else getSocket().timeout(8000).emit(event, data, (err, reply) => (err ? reject(new Error('The server did not answer')) : done(reply)));
  });
}
