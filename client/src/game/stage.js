// The battle canvas, its renderer, the keyboard/mouse/touch input and the HUD.
// They are created once and shared by local games (GameSession) and online games
// (NetGame), because both draw on the same canvas and read the same keys.
//
// Written with help from a generative AI coding assistant; reviewed by Sayub Shakya.

import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { initSound } from './sound.js';
import { initMusic } from './music.js';

let stage = null;

// Optional frames-per-second readout (Settings → Show FPS), to check smoothness.
function createMeter(el) {
  let visible = false;
  let frames = 0;
  let since = performance.now();
  let lastTick = 0;
  return {
    setVisible(on) { visible = on; el.hidden = !on; },
    tick(now) {
      if (!visible || now === lastTick) return;   // both game loops call this; count each frame once
      lastTick = now;
      frames += 1;
      if (now - since >= 500) {
        el.textContent = `${Math.round((frames * 1000) / (now - since))} fps`;
        frames = 0;
        since = now;
      }
    },
  };
}

export function getStage() {
  if (!stage) {
    const canvas = document.getElementById('battle-canvas');
    const renderer = createRenderer(canvas);
    stage = { canvas, renderer, input: createInput(canvas, renderer), hud: createHud(), meter: createMeter(document.getElementById('fps')) };
    initSound();
    initMusic();
  }
  return stage;
}
