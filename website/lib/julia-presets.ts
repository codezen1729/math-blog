import type { Complex } from './dynamics';

export type JuliaPreset = Complex & { id: string; name: string; kind: string; detail?: number; span?: number; approximate?: boolean };

// Named quadratic examples. Definitions and primary references are recorded in
// docs/laboratory.md; displayed rounding never changes the stored parameter.
export const JULIA_PRESETS: JuliaPreset[] = [
  { id: 'rabbit', name: 'Douady rabbit', re: -0.12256116687665362, im: 0.7448617666197442, kind: 'Superattracting period 3' },
  { id: 'basilica', name: 'Basilica', re: -1, im: 0, kind: 'Superattracting period 2' },
  { id: 'corabbit', name: 'Corabbit', re: -0.12256116687665362, im: -0.7448617666197442, kind: 'The reflected rabbit · period 3' },
  { id: 'airplane', name: 'Airplane', re: -1.7548776662466928, im: 0, kind: 'Superattracting period 3', span: 4.2 },
  { id: 'double-basilica', name: 'Double basilica', re: -1.3107026413368328, im: 0, kind: 'Superattracting period 4', span: 4 },
  { id: 'circle', name: 'Circle', re: 0, im: 0, kind: 'Julia set: the unit circle · filled set: the unit disk' },
  { id: 'chebyshev', name: 'Chebyshev interval', re: -2, im: 0, kind: 'Julia set: the real interval [−2, 2]', span: 4.4 },
  { id: 'dendrite', name: 'Dendrite', re: 0, im: 1, kind: 'A preperiodic critical orbit · no interior', detail: 350 },
  { id: 'cauliflower', name: 'Cauliflower', re: 0.25, im: 0, kind: 'A parabolic fixed point of multiplier 1', detail: 700 },
  { id: 'san-marco', name: 'Parabolic basilica', re: -0.75, im: 0, kind: 'Also called San Marco · fixed-point multiplier −1', detail: 700 },
  { id: 'siegel', name: 'Golden-mean Siegel', re: -0.39054087021840006, im: -0.5867879073469687, kind: 'A Siegel disk with golden-mean rotation number', detail: 700, approximate: true },
  { id: 'feigenbaum', name: 'Feigenbaum', re: -1.4011551890920506, im: 0, kind: 'The real period-doubling limit', detail: 700, span: 4, approximate: true },
  { id: 'cantor', name: 'Cantor dust', re: -0.75, im: 0.3, kind: 'An escaping critical orbit · a totally disconnected Julia set' },
];

export const DEFAULT_JULIA_PRESET = JULIA_PRESETS[0];
export function matchingJuliaPreset(c: Complex) {
  return JULIA_PRESETS.find((preset) => Math.hypot(c.re - preset.re, c.im - preset.im) < 1e-13);
}
