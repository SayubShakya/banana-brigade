// The "stage": one shared canvas, renderer, input, HUD and FPS meter for every match.
// It is created once (lazily) and reused, so we never attach input listeners twice.
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { initSound } from './sound.js';
import { initMusic } from './music.js';

let stage = null;

/**
 * Small FPS counter. tick(now) is called every frame; twice a second it
 * writes frames-per-second into the element.
 * @param {HTMLElement} el the element that shows the FPS text
 */
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

/**
 * Returns the shared stage, creating it on first use (singleton).
 * Also starts the sound and music systems once.
 * @returns {{canvas, renderer, input, hud, meter}}
 */
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
