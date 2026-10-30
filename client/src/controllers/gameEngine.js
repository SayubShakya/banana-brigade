// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { createGameSession } from '../game/GameSession.js';
import { createNetGame } from '../net/NetGame.js';

// One game session for the whole page; it owns the battle canvas and HUD.
let gameSession = null;
export const game = () => (gameSession ??= createGameSession());

// Online matches are run by the server; NetGame shows them (created on first use).
let netGame = null;
export const net = () => (netGame ??= createNetGame());
// The online view if one was ever opened, otherwise null.
export const netIfStarted = () => netGame;
