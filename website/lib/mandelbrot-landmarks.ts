import type { Complex, PlaneView } from './dynamics';

export type GuideId = 'satellite' | 'misiurewicz' | 'feigenbaum' | 'bifurcations';
export type LandmarkVisit = { guide: GuideId; c: Complex; view: PlaneView; detail: number; juliaSpan?: number };
export const RABBIT_ROOT: Complex = { re: -1 / 8, im: 3 * Math.sqrt(3) / 8 };
export const FEIGENBAUM = -1.4011551890920506;
export const DOUBLING_CENTRES = [
  { period: 1, c: 0 },
  { period: 2, c: -1 },
  { period: 4, c: -1.3107026413368328 },
  { period: 8, c: -1.3815474844320615 },
  { period: 16, c: -1.3969453597045607 },
];
export const LANDMARKS: { id: GuideId; label: string; visit: LandmarkVisit }[] = [
  { id: 'satellite', label: 'Satellite copies', visit: { guide: 'satellite', c: { re: -0.12256116687665362, im: 0.7448617666197442 }, view: { re: -0.13, im: 0.76, span: 0.52 }, detail: 350 } },
  { id: 'misiurewicz', label: 'Misiurewicz points', visit: { guide: 'misiurewicz', c: { re: 0, im: 1 }, view: { re: -0.04, im: 0.98, span: 0.32 }, detail: 700 } },
  { id: 'feigenbaum', label: 'Feigenbaum point', visit: { guide: 'feigenbaum', c: { re: FEIGENBAUM, im: 0 }, view: { re: -1.39, im: 0, span: 0.2 }, detail: 700, juliaSpan: 4 } },
  { id: 'bifurcations', label: 'Bifurcations', visit: { guide: 'bifurcations', c: { re: -1, im: 0 }, view: { re: -0.875, im: 0, span: 2.65 }, detail: 350, juliaSpan: 4.4 } },
];

/** Tail of the real critical orbit, not the full real Julia set or attractor. */
export function realOrbitTail(c: number, transient = 450, samples = 100): number[] {
  let x = 0;
  const points: number[] = [];
  for (let n = 0; n < transient + samples; n++) {
    x = x * x + c;
    if (!Number.isFinite(x) || Math.abs(x) > 2) return points;
    if (n >= transient) points.push(x);
  }
  return points;
}
