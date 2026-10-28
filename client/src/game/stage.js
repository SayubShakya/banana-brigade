// The battle canvas, its renderer, the keyboard/mouse/touch input and the HUD.
// They are created once and shared by local games (GameSession) and online games
// (NetGame), because both draw on the same canvas and read the same keys.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { initSound } from './sound.js';

let stage = null;

export function getStage() {
  if (!stage) {
    const canvas = document.getElementById('battle-canvas');
    const renderer = createRenderer(canvas);
    stage = { canvas, renderer, input: createInput(canvas, renderer), hud: createHud() };
    initSound();
  }
  return stage;
}
