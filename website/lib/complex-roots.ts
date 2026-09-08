import type { Complex } from './dynamics';

export type RootMethod = 'aberth' | 'laguerre';
export type RootSample = {
  value: Complex;
  scaledResidual: number;
  iterations: number;
  method: RootMethod;
  clusterId: number;
};
export type RootCluster = {
  id: number;
  centre: Complex;
  multiplicity: number;
  maxScaledResidual: number;
  minimumSeparation: number;
  multiplicityStatus: 'separated' | 'uncertain';
};
export type AllRootsResult = {
  degree: number;
  roots: RootSample[];
  clusters: RootCluster[];
  complete: boolean;
  method: RootMethod;
  maxScaledResidual: number;
  vietaError: number;
  reason?: 'invalid-polynomial' | 'non-convergence' | 'residual';
};
export type AllRootsOptions = {
  maxIterations?: number;
  residualTolerance?: number;
  clusterTolerance?: number;
};

export const complex = (re: number, im = 0): Complex => ({ re, im });
export const addComplex = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const subtractComplex = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
export const scaleComplex = (z: Complex, scale: number): Complex => ({ re: z.re * scale, im: z.im * scale });
export const multiplyComplex = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
export const divideComplex = (a: Complex, b: Complex): Complex => {
  const denominator = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / denominator, im: (a.im * b.re - a.re * b.im) / denominator };
};
export const absComplex = (z: Complex) => Math.hypot(z.re, z.im);
export const finiteComplex = (z: Complex) => Number.isFinite(z.re) && Number.isFinite(z.im);
export const conjugateComplex = (z: Complex): Complex => ({ re: z.re, im: -z.im });
export const reciprocalComplex = (z: Complex): Complex => divideComplex(complex(1), z);

export function sqrtComplex(z: Complex): Complex {
  const modulus = absComplex(z);
  if (modulus === 0) return complex(0);
  if (z.re >= 0) {
    const re = Math.sqrt((modulus + z.re) / 2);
    return { re, im: z.im / (2 * re) };
  }
  const im = (z.im < 0 ? -1 : 1) * Math.sqrt((modulus - z.re) / 2);
  return { re: Math.abs(z.im / (2 * im)), im };
}

export function integerPower(z: Complex, exponent: number): Complex {
  let result = complex(1), base = z, n = exponent;
  while (n > 0) {
    if (n & 1) result = multiplyComplex(result, base);
    base = multiplyComplex(base, base);
    n = Math.floor(n / 2);
  }
  return result;
}

/** Chordal distance on the Riemann sphere for two finite affine points. */
export function chordalDistance(a: Complex, b: Complex): number {
  return absComplex(subtractComplex(a, b)) / Math.sqrt((1 + absComplex(a) ** 2) * (1 + absComplex(b) ** 2));
}

export function evaluatePolynomial(coefficients: Complex[], z: Complex): Complex {
  let value = coefficients[0] ?? complex(0);
  for (let i = 1; i < coefficients.length; i++) value = addComplex(multiplyComplex(value, z), coefficients[i]);
  return value;
}

export function evaluatePolynomialWithDerivatives(coefficients: Complex[], z: Complex) {
  let value = coefficients[0] ?? complex(0), derivative = complex(0), secondDerivative = complex(0);
  for (let i = 1; i < coefficients.length; i++) {
    secondDerivative = addComplex(multiplyComplex(secondDerivative, z), scaleComplex(derivative, 2));
    derivative = addComplex(multiplyComplex(derivative, z), value);
    value = addComplex(multiplyComplex(value, z), coefficients[i]);
  }
  return { value, derivative, secondDerivative };
}

export function scaledPolynomialResidual(coefficients: Complex[], z: Complex): number {
  const numerator = absComplex(evaluatePolynomial(coefficients, z));
  const radius = absComplex(z);
  let denominator = 0;
  for (const coefficient of coefficients) denominator = denominator * radius + absComplex(coefficient);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Infinity;
  return numerator / denominator;
}

function normalizedCoefficients(coefficients: Complex[]) {
  const first = coefficients.findIndex(coefficient => absComplex(coefficient) !== 0);
  if (first < 0) return null;
  const trimmed = coefficients.slice(first);
  const magnitude = Math.max(...trimmed.map(absComplex));
  if (!Number.isFinite(magnitude) || magnitude === 0 || trimmed.length < 2 || trimmed.some(coefficient => !finiteComplex(coefficient))) return null;
  return trimmed.map(coefficient => scaleComplex(coefficient, 1 / magnitude));
}

function rootRadius(coefficients: Complex[]) {
  const leading = absComplex(coefficients[0]);
  let bound = 1;
  for (let i = 1; i < coefficients.length; i++) {
    const ratio = absComplex(coefficients[i]) / leading;
    if (ratio > 0 && Number.isFinite(ratio)) bound = Math.max(bound, 2 * ratio ** (1 / i));
  }
  return Math.min(1e100, bound);
}

function polish(coefficients: Complex[], root: Complex, limit = 16) {
  let z = root;
  for (let iteration = 0; iteration < limit; iteration++) {
    const { value, derivative } = evaluatePolynomialWithDerivatives(coefficients, z);
    if (!finiteComplex(value) || !finiteComplex(derivative) || absComplex(derivative) === 0) break;
    const correction = divideComplex(value, derivative);
    if (!finiteComplex(correction)) break;
    z = subtractComplex(z, correction);
    if (absComplex(correction) <= 4 * Number.EPSILON * (1 + absComplex(z))) break;
  }
  return z;
}

function aberthRoots(coefficients: Complex[], maxIterations: number, phase: number) {
  const degree = coefficients.length - 1, radius = rootRadius(coefficients);
  const roots = Array.from({ length: degree }, (_, index) => {
    const angle = 2 * Math.PI * (index + phase) / degree;
    // Alternating radii break exact rotational symmetries without randomness.
    const radial = radius * (0.82 + 0.18 * ((index % 3) / 2));
    return { re: radial * Math.cos(angle), im: radial * Math.sin(angle) };
  });
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    let largest = 0;
    const next = roots.slice();
    for (let i = 0; i < degree; i++) {
      const { value, derivative } = evaluatePolynomialWithDerivatives(coefficients, roots[i]);
      if (absComplex(value) === 0) continue;
      if (!finiteComplex(value) || !finiteComplex(derivative) || absComplex(derivative) === 0) { largest = Infinity; continue; }
      const newton = divideComplex(value, derivative);
      let repulsion = complex(0);
      for (let j = 0; j < degree; j++) if (j !== i) {
        const difference = subtractComplex(roots[i], roots[j]);
        if (absComplex(difference) > Number.EPSILON) repulsion = addComplex(repulsion, reciprocalComplex(difference));
      }
      const denominator = subtractComplex(complex(1), multiplyComplex(newton, repulsion));
      let correction = absComplex(denominator) > 1e-15 ? divideComplex(newton, denominator) : newton;
      if (!finiteComplex(correction)) { largest = Infinity; continue; }
      const maximumStep = 2 * (1 + absComplex(roots[i]));
      if (absComplex(correction) > maximumStep) correction = scaleComplex(correction, maximumStep / absComplex(correction));
      next[i] = subtractComplex(roots[i], correction);
      largest = Math.max(largest, absComplex(correction) / (1 + absComplex(next[i])));
    }
    roots.splice(0, roots.length, ...next);
    if (largest < 2e-14) break;
  }
  return { roots: roots.map(root => polish(coefficients, root)), iterations: iterations + 1 };
}

function laguerreRoot(coefficients: Complex[], seed: Complex, maxIterations: number) {
  const degree = coefficients.length - 1;
  let z = seed;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const { value, derivative, secondDerivative } = evaluatePolynomialWithDerivatives(coefficients, z);
    if (scaledPolynomialResidual(coefficients, z) <= 1e-14) return { root: z, iterations: iteration + 1 };
    if (!finiteComplex(value) || absComplex(value) === 0) return { root: z, iterations: iteration + 1 };
    const g = divideComplex(derivative, value);
    const h = subtractComplex(multiplyComplex(g, g), divideComplex(secondDerivative, value));
    const radical = sqrtComplex(scaleComplex(subtractComplex(scaleComplex(h, degree), multiplyComplex(g, g)), degree - 1));
    const plus = addComplex(g, radical), minus = subtractComplex(g, radical);
    const denominator = absComplex(plus) >= absComplex(minus) ? plus : minus;
    let correction: Complex;
    if (absComplex(denominator) === 0 || !finiteComplex(denominator)) {
      const angle = 0.47 * (iteration + 1);
      correction = { re: (1 + absComplex(z)) * Math.cos(angle), im: (1 + absComplex(z)) * Math.sin(angle) };
    } else correction = divideComplex(complex(degree), denominator);
    if (!finiteComplex(correction)) break;
    z = subtractComplex(z, correction);
    if (absComplex(correction) <= 4e-14 * (1 + absComplex(z))) return { root: z, iterations: iteration + 1 };
  }
  return { root: z, iterations: maxIterations };
}

function deflate(coefficients: Complex[], root: Complex) {
  const result = [coefficients[0]];
  for (let i = 1; i < coefficients.length - 1; i++) result.push(addComplex(coefficients[i], multiplyComplex(result[i - 1], root)));
  return result;
}

function laguerreRoots(coefficients: Complex[], maxIterations: number, phase: number) {
  const original = coefficients, roots: Complex[] = [];
  let reduced = coefficients.slice(), iterations = 0;
  while (reduced.length > 2) {
    const radius = rootRadius(reduced), index = roots.length;
    const angle = 2 * Math.PI * (index + phase) / (original.length - 1);
    const result = laguerreRoot(reduced, { re: radius * Math.cos(angle), im: radius * Math.sin(angle) }, maxIterations);
    iterations += result.iterations;
    const root = polish(reduced, result.root);
    roots.push(root);
    reduced = deflate(reduced, root);
  }
  roots.push(divideComplex(scaleComplex(reduced[1], -1), reduced[0]));
  return { roots: roots.map(root => polish(original, root)), iterations };
}

function vietaError(coefficients: Complex[], roots: Complex[]) {
  const leading = coefficients[0];
  const expectedSum = scaleComplex(divideComplex(coefficients[1], leading), -1);
  const actualSum = roots.reduce(addComplex, complex(0));
  const sumError = absComplex(subtractComplex(actualSum, expectedSum)) / (1 + absComplex(expectedSum));
  const degree = roots.length;
  const expectedProduct = scaleComplex(divideComplex(coefficients[degree], leading), degree % 2 ? -1 : 1);
  const actualProduct = roots.reduce(multiplyComplex, complex(1));
  const productError = absComplex(subtractComplex(actualProduct, expectedProduct)) / (1 + absComplex(expectedProduct));
  return Math.max(sumError, productError);
}

function makeResult(coefficients: Complex[], roots: Complex[], method: RootMethod, iterations: number, residualTolerance: number, requestedClusterTolerance: number): AllRootsResult {
  const residuals = roots.map(root => scaledPolynomialResidual(coefficients, root));
  const maxScaledResidual = Math.max(...residuals);
  // Simultaneous methods separate exact multiple roots by a few square-root
  // ulps even when the backward residual has reached machine zero.
  const dynamicTolerance = Math.max(requestedClusterTolerance, 4e-6, 8 * Math.sqrt(Math.max(maxScaledResidual, Number.EPSILON)));
  const parents = roots.map((_, index) => index);
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const join = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parents[b] = a; };
  for (let i = 0; i < roots.length; i++) for (let j = i + 1; j < roots.length; j++) if (chordalDistance(roots[i], roots[j]) <= dynamicTolerance) join(i, j);
  const groups = new Map<number, number[]>();
  roots.forEach((_, index) => { const parent = find(index); groups.set(parent, [...(groups.get(parent) ?? []), index]); });
  const clusters: RootCluster[] = [];
  const clusterForRoot = new Array<number>(roots.length);
  for (const indices of groups.values()) {
    const id = clusters.length;
    indices.forEach(index => { clusterForRoot[index] = id; });
    const centre = scaleComplex(indices.reduce((sum, index) => addComplex(sum, roots[index]), complex(0)), 1 / indices.length);
    let minimumSeparation = Infinity;
    for (const index of indices) for (let j = 0; j < roots.length; j++) if (!indices.includes(j)) minimumSeparation = Math.min(minimumSeparation, chordalDistance(roots[index], roots[j]));
    clusters.push({
      id,
      centre,
      multiplicity: indices.length,
      maxScaledResidual: Math.max(...indices.map(index => residuals[index])),
      minimumSeparation,
      multiplicityStatus: indices.length === 1 ? 'separated' : 'uncertain',
    });
  }
  const samples = roots.map((value, index): RootSample => ({ value, scaledResidual: residuals[index], iterations, method, clusterId: clusterForRoot[index] }));
  const error = vietaError(coefficients, roots);
  const complete = roots.every(finiteComplex) && maxScaledResidual <= residualTolerance && error <= Math.max(1e-5, 100 * residualTolerance);
  return { degree: roots.length, roots: samples, clusters, complete, method, maxScaledResidual, vietaError: error, reason: complete ? undefined : maxScaledResidual > residualTolerance ? 'residual' : 'non-convergence' };
}

/** Deterministic all-roots calculation. Results are numerical and are accepted
 * only after backward-residual and Vieta checks. */
export function solveAllPolynomialRoots(coefficients: Complex[], options: AllRootsOptions = {}): AllRootsResult {
  const normalized = normalizedCoefficients(coefficients);
  if (!normalized) return { degree: 0, roots: [], clusters: [], complete: false, method: 'aberth', maxScaledResidual: Infinity, vietaError: Infinity, reason: 'invalid-polynomial' };
  const degree = normalized.length - 1;
  if (degree === 1) {
    const root = divideComplex(scaleComplex(normalized[1], -1), normalized[0]);
    return makeResult(normalized, [root], 'aberth', 1, options.residualTolerance ?? 2e-10, options.clusterTolerance ?? 2e-7);
  }
  const maxIterations = options.maxIterations ?? 240;
  const residualTolerance = options.residualTolerance ?? 2e-10;
  const clusterTolerance = options.clusterTolerance ?? 2e-7;
  const candidates: AllRootsResult[] = [];
  for (const phase of [0.123, 0.317, 0.619]) {
    const result = aberthRoots(normalized, maxIterations, phase);
    candidates.push(makeResult(normalized, result.roots, 'aberth', result.iterations, residualTolerance, clusterTolerance));
    if (candidates.at(-1)?.complete && candidates.at(-1)!.maxScaledResidual < residualTolerance / 100) break;
  }
  if (!candidates.some(candidate => candidate.complete)) for (const phase of [0.191, 0.433, 0.727]) {
    const result = laguerreRoots(normalized, maxIterations, phase);
    candidates.push(makeResult(normalized, result.roots, 'laguerre', result.iterations, residualTolerance, clusterTolerance));
  }
  candidates.sort((a, b) => Number(b.complete) - Number(a.complete) || a.maxScaledResidual - b.maxScaledResidual || a.vietaError - b.vietaError);
  return candidates[0];
}
