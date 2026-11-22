// gameEngine.js: lazy singletons for the offline game session and the online (socket) game.
// They are created on first use, so the canvas engine is not built until it is needed.
import { createGameSession } from '../game/GameSession.js';
import { createNetGame } from '../net/NetGame.js';

let gameSession = null;
export const game = () => (gameSession ??= createGameSession());

let netGame = null;
// netIfStarted returns null if online play was never opened (so nothing is created by accident).
export const net = () => (netGame ??= createNetGame());
export const netIfStarted = () => netGame;
