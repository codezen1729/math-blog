import type { Complex, PlaneView } from './dynamics';

// Example 4 of Luo–Mj–Mukherjee, arXiv:2504.13107v2. The implemented
// symmetric real slice has D={|z|>1}; see docs/correspondence.md for the
// domain proof, normalization and numerical error/iteration guardrails.
export const CORRESPONDENCE_VIEW: PlaneView = { re: 0, im: 0, span: 4.2 };
export const MIN_C = -0.6;
export const MAX_C = 0.6;
export const UNRESOLVED = 0;
export const NON_ESCAPING = 1;
export const TILING = 2;
export type SetResult = { kind: number; depth: number; reason: 'basin' | 'tile' | 'boundary' | 'inverse' | 'depth' };
export type TileBoundary = { points: Complex[]; rows: number[][]; minY: number; maxY: number; margin: number };
const mul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const inv = (z: Complex): Complex => { const r = z.re * z.re + z.im * z.im; return { re: z.re / r, im: -z.im / r }; };
const abs = (z: Complex) => Math.hypot(z.re, z.im);
const finite = (z: Complex) => Number.isFinite(z.re) && Number.isFinite(z.im);
// A designated sphere point, distinct from NaN or numerical overflow.
const sphereInfinity = (z: Complex) => z.re === Infinity && z.im === 0;

export function validateCorrespondenceParameter(c: number) {
  if (!Number.isFinite(c) || c < MIN_C || c > MAX_C) throw new RangeError('This model implements only the real slice −0.6 ≤ c ≤ 0.6, including its pinched endpoints.');
}

export function correspondenceR(z: Complex, c: number): Complex {
  const q = inv(z), q2 = mul(q, q), q3 = mul(q2, q), q5 = mul(q3, q2);
  return { re: z.re + c * q.re - c * q3.re / 3 + q5.re / 5, im: z.im + c * q.im - c * q3.im / 3 + q5.im / 5 };
}

export function correspondenceDerivative(z: Complex, c: number): Complex {
  const q = inv(z), q2 = mul(q, q), q4 = mul(q2, q2), q6 = mul(q4, q2);
  return { re: 1 - c * q2.re + c * q4.re - q6.re, im: -c * q2.im + c * q4.im - q6.im };
}

/** R(1/z), not R(z) iteration and not conjugate reflection. */
export function reflectedR(z: Complex, c: number): Complex {
  const q = inv(z), z2 = mul(z, z), z3 = mul(z2, z), z5 = mul(z3, z2);
  return { re: q.re + c * z.re - c * z3.re / 3 + z5.re / 5, im: q.im + c * z.im - c * z3.im / 3 + z5.im / 5 };
}

export function correspondenceCriticalPoints(c: number): Complex[] {
  validateCorrespondenceParameter(c);
  const angle = Math.acos((c - 1) / 2) / 2;
  return [0, angle, Math.PI - angle, Math.PI, Math.PI + angle, 2 * Math.PI - angle].map(t => ({ re: Math.cos(t), im: Math.sin(t) }));
}

export function createTileBoundary(c: number, segments = 1024): TileBoundary {
  validateCorrespondenceParameter(c);
  if (!Number.isFinite(segments)) throw new RangeError('The boundary resolution must be finite.');
  // Include quarter turns and eighth turns exactly at the pinched endpoints.
  const count = Math.max(128, Math.min(16384, 8 * Math.ceil(segments / 8)));
  const points = Array.from({ length: count }, (_, i) => correspondenceR({ re: Math.cos(2 * Math.PI * i / count), im: Math.sin(2 * Math.PI * i / count) }, c));
  // Uniform chord-error bound: sup |gamma''| <= 6+4|c|. A point farther
  // than this from the polygon has the same inside/outside classification
  // for the true cusped curve. The extra term guards floating-point noise.
  const margin = (6 + 4 * Math.abs(c)) * (2 * Math.PI / count) ** 2 / 8 + 2e-10;
  const minY = Math.min(...points.map(p => p.im)) - 2 * margin;
  const maxY = Math.max(...points.map(p => p.im)) + 2 * margin;
  const rows: number[][] = Array.from({ length: 512 }, () => []);
  const bin = (y: number) => Math.max(0, Math.min(rows.length - 1, Math.floor((y - minY) / (maxY - minY) * rows.length)));
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % count];
    const start = bin(Math.min(a.im, b.im) - margin), end = bin(Math.max(a.im, b.im) + margin);
    for (let j = start; j <= end; j++) rows[j].push(i);
  }
  return { points, rows, minY, maxY, margin };
}

/** -1=outside rank-zero tile, 0=boundary uncertainty, 1=inside tile. */
export function locateFundamentalTile(w: Complex, tile: TileBoundary): number {
  if (!finite(w)) return 0;
  if (w.im < tile.minY || w.im > tile.maxY) return -1;
  const row = Math.max(0, Math.min(tile.rows.length - 1, Math.floor((w.im - tile.minY) / (tile.maxY - tile.minY) * tile.rows.length)));
  let inside = false;
  for (const i of tile.rows[row]) {
    const a = tile.points[i], b = tile.points[(i + 1) % tile.points.length];
    const dx = b.re - a.re, dy = b.im - a.im, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((w.re - a.re) * dx + (w.im - a.im) * dy) / length2)) : 0;
    if (Math.hypot(w.re - a.re - t * dx, w.im - a.im - t * dy) <= tile.margin) return 0;
    if ((a.im > w.im) !== (b.im > w.im) && w.re < a.re + (w.im - a.im) * dx / dy) inside = !inside;
  }
  return inside ? 1 : -1;
}

/** Exterior univalence proves at most one eligible root. Accept only a
 * converged exterior solution with residual and boundary-separation checks. */
export function exteriorInverse(w: Complex, c: number): Complex | null {
  const radius = abs(w), angle = Math.atan2(w.im, w.re);
  // A near-circle second pass avoids attraction to an interior root when the
  // large-radius seeds stall against the exterior constraint near a cusp.
  for (const r of [Math.max(1.12, radius + 0.12), 1.05]) for (const offset of [0, 0.45, -0.45, 0.9, -0.9]) {
    let z: Complex = { re: r * Math.cos(angle + offset), im: r * Math.sin(angle + offset) };
    for (let n = 0; n < 42; n++) {
      const value = correspondenceR(z, c), derivative = correspondenceDerivative(z, c);
      const residual = { re: value.re - w.re, im: value.im - w.im };
      const error = abs(residual), slope = abs(derivative);
      if (error <= 2e-12 * (1 + radius)) {
        if (finite(z) && slope > 1e-8 && abs(z) - 1 > Math.max(1e-7, 32 * error / slope)) return z;
        break;
      }
      if (!Number.isFinite(error + slope) || slope < 1e-12) break;
      const correction = mul(residual, inv(derivative));
      let accepted = false;
      for (let damping = 1; damping >= 1 / 1024; damping /= 2) {
        const candidate = { re: z.re - damping * correction.re, im: z.im - damping * correction.im };
        if (abs(candidate) <= 1 + 1e-9) continue;
        const next = correspondenceR(candidate, c);
        if (Math.hypot(next.re - w.re, next.im - w.im) < error) { z = candidate; accepted = true; break; }
      }
      if (!accepted) break;
    }
  }
  return null;
}

export function classifyMating(w: Complex, c: number, iterations: number, tile = createTileBoundary(c)): SetResult {
  validateCorrespondenceParameter(c);
  if (!Number.isInteger(iterations) || iterations < 0 || iterations > 1024) throw new RangeError('Iteration depth must be an integer from 0 to 1024.');
  if (sphereInfinity(w)) return { kind: NON_ESCAPING, depth: 0, reason: 'basin' };
  let value = w;
  for (let depth = 0; depth <= iterations; depth++) {
    if (!finite(value)) return { kind: UNRESOLVED, depth, reason: 'inverse' };
    // In this normalization infinity is INSIDE K(F). It is not tiling escape.
    if (abs(value) >= 4) return { kind: NON_ESCAPING, depth, reason: 'basin' };
    const position = locateFundamentalTile(value, tile);
    if (position === 1) return { kind: TILING, depth, reason: 'tile' };
    if (position === 0) return { kind: UNRESOLVED, depth, reason: 'boundary' };
    if (depth === iterations) return { kind: UNRESOLVED, depth, reason: 'depth' };
    const inverse = exteriorInverse(value, c);
    if (!inverse) return { kind: UNRESOLVED, depth, reason: 'inverse' };
    value = reflectedR(inverse, c);
  }
  return { kind: UNRESOLVED, depth: iterations, reason: 'depth' };
}

export function classifyCorrespondence(z: Complex, c: number, iterations: number, tile = createTileBoundary(c)): SetResult {
  validateCorrespondenceParameter(c);
  if (sphereInfinity(z)) return { kind: NON_ESCAPING, depth: 0, reason: 'basin' };
  if (!finite(z)) return { kind: UNRESOLVED, depth: 0, reason: 'inverse' };
  const r = abs(z);
  // Direct lower bounds give |R(z)|>4 in both neighborhoods, including z=0.
  if (r < 0.1 || r > 5) return { kind: NON_ESCAPING, depth: 0, reason: 'basin' };
  return classifyMating(correspondenceR(z, c), c, iterations, tile);
}

export function renderCorrespondenceGrid(c: number, view: PlaneView, size: number, iterations: number, onProgress?: (progress: number) => void) {
  validateCorrespondenceParameter(c);
  if (!Number.isInteger(size) || size < 1 || size > 1536) throw new RangeError('Raster size must be an integer from 1 to 1536.');
  if (![view.re, view.im, view.span].every(Number.isFinite) || view.span <= 0) throw new RangeError('The view must be finite and have positive width.');
  if (!Number.isInteger(iterations) || iterations < 0 || iterations > 1024) throw new RangeError('Iteration depth must be an integer from 0 to 1024.');
  const tile = createTileBoundary(c, Math.max(1024, Math.min(8192, Math.ceil(2500 / Math.sqrt(view.span)))));
  const kinds = new Uint8Array(size * size), depths = new Uint16Array(size * size), boundary = new Uint8Array(size * size);
  const counts = { nonEscaping: 0, tiling: 0, unresolved: 0, inverseFailures: 0 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const z = { re: view.re + ((x + 0.5) / size - 0.5) * view.span, im: view.im + (0.5 - (y + 0.5) / size) * view.span };
      const result = classifyCorrespondence(z, c, iterations, tile), index = y * size + x;
      kinds[index] = result.kind; depths[index] = result.depth;
      if (result.kind === NON_ESCAPING) counts.nonEscaping++;
      else if (result.kind === TILING) counts.tiling++;
      else { counts.unresolved++; if (result.reason === 'inverse') counts.inverseFailures++; }
    }
    if (y % 16 === 0) onProgress?.((y + 1) / size);
  }
  // A pixel-scale interface, not a claim that the entire unresolved set is Λ.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (!kinds[i]) continue;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && kinds[ny * size + nx] && kinds[ny * size + nx] !== kinds[i]) boundary[i] = 1;
    }
  }
  return { c, view, size, iterations, kinds, depths, boundary, counts };
}

export type CorrespondenceGrid = ReturnType<typeof renderCorrespondenceGrid>;
