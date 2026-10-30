// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { initSound } from './sound.js';
import { initMusic } from './music.js';

let stage = null;

function createMeter(el) {
  let visible = false;
  let frames = 0;
  let since = performance.now();
  let lastTick = 0;
  return {
    setVisible(on) { visible = on; el.hidden = !on; },
    tick(now) {
      if (!visible || now === lastTick) return;
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
