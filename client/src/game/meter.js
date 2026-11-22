// Banana Meter maths: how much the meter fills when a Banana API puzzle is answered,
// based on the answer grade (gold/silver/bronze) and the current answer streak.
import { BANANA_METER } from './config.js';

export const gradeLabel = (grade) => (grade ? grade.toUpperCase() : '');

/**
 * Meter points for a correct answer: the grade's base gain times a streak multiplier (capped).
 * @param {string} grade 'gold' | 'silver' | 'bronze'
 * @param {number} streak correct answers in a row so far
 * @returns {number} points to add
 */
export function meterGain(grade, streak) {
  const base = BANANA_METER.gain[grade] ?? 0;
  return Math.round(base * Math.min(BANANA_METER.maxMultiplier, 1 + streak / BANANA_METER.streakStep));
}

/**
 * Applies one puzzle answer to the meter. A wrong answer halves the streak and adds nothing.
 * @param {{value:number,streak:number}} meter current meter state
 * @param {{correct:boolean,grade?:string}} answer the result of the puzzle
 * @returns {{value:number,streak:number,gained:number,full:boolean}} the new meter state (not mutated)
 */
export function applyAnswer(meter, { correct, grade }) {
  if (!correct) return { value: meter.value, streak: Math.floor(meter.streak / 2), gained: 0, full: meter.value >= BANANA_METER.max };
  const gained = meterGain(grade ?? 'bronze', meter.streak);
  const value = Math.min(BANANA_METER.max, meter.value + gained);
  return { value, streak: meter.streak + 1, gained, full: value >= BANANA_METER.max };
}

// How many weapons a banana crate offers to choose from, based on the answer grade.
export function crateChoiceCount(grade) {
  return BANANA_METER.crateChoices[grade] ?? BANANA_METER.crateChoices.silver;
}

// A gold answer gives a spawn shield; other grades give none.
export function spawnShieldFor(grade) {
  return grade === 'gold' ? BANANA_METER.goldShield : null;
}
