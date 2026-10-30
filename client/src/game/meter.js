// Written with help from Claude (Anthropic), an AI coding assistant; reviewed by Sayub Shakya.

import { BANANA_METER } from './config.js';

export const gradeLabel = (grade) => (grade ? grade.toUpperCase() : '');

export function meterGain(grade, streak) {
  const base = BANANA_METER.gain[grade] ?? 0;
  return Math.round(base * Math.min(BANANA_METER.maxMultiplier, 1 + streak / BANANA_METER.streakStep));
}

export function applyAnswer(meter, { correct, grade }) {
  if (!correct) return { value: meter.value, streak: Math.floor(meter.streak / 2), gained: 0, full: meter.value >= BANANA_METER.max };
  const gained = meterGain(grade ?? 'bronze', meter.streak);
  const value = Math.min(BANANA_METER.max, meter.value + gained);
  return { value, streak: meter.streak + 1, gained, full: value >= BANANA_METER.max };
}

export function crateChoiceCount(grade) {
  return BANANA_METER.crateChoices[grade] ?? BANANA_METER.crateChoices.silver;
}

export function spawnShieldFor(grade) {
  return grade === 'gold' ? BANANA_METER.goldShield : null;
}
