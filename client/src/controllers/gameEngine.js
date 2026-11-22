import { createGameSession } from '../game/GameSession.js';
import { createNetGame } from '../net/NetGame.js';

let gameSession = null;
export const game = () => (gameSession ??= createGameSession());

let netGame = null;
export const net = () => (netGame ??= createNetGame());
export const netIfStarted = () => netGame;
