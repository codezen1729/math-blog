import type { Complex, PlaneView } from './dynamics';
import { correspondenceDerivative, correspondenceR } from './correspondence.ts';
import {
  absComplex,
  addComplex,
  chordalDistance,
  complex,
  conjugateComplex,
  finiteComplex,
  integerPower,
  multiplyComplex,
  reciprocalComplex,
  scaleComplex,
  scaledPolynomialResidual,
  solveAllPolynomialRoots,
  sqrtComplex,
  subtractComplex,
} from './complex-roots.ts';
import type { AllRootsResult } from './complex-roots';

export type CorrespondenceMode = 'verified-round' | 'post-pinching' | 'ramified';
export type ParameterBand = 'round-interior' | 'pinched-endpoint' | 'post-pinched' | 'ramification-transition' | 'ramified';
export type SpherePoint = { kind: 'finite'; value: Complex } | { kind: 'infinity' };
export const SPHERE_INFINITY: SpherePoint = { kind: 'infinity' };
export const finiteSpherePoint = (value: Complex): SpherePoint => ({ kind: 'finite', value });

export const ALGEBRAIC_MIN_C = -1;
export const ALGEBRAIC_MAX_C = 3;
export const PINCHING_MIN_C = -0.6;
export const PINCHING_MAX_C = 0.6;

export function parameterBand(c: number): ParameterBand {
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be a finite real number.');
  if (c === ALGEBRAIC_MIN_C || c === ALGEBRAIC_MAX_C) return 'ramification-transition';
  if (c < ALGEBRAIC_MIN_C || c > ALGEBRAIC_MAX_C) return 'ramified';
  if (c === PINCHING_MIN_C || c === PINCHING_MAX_C) return 'pinched-endpoint';
  if (c > PINCHING_MIN_C && c < PINCHING_MAX_C) return 'round-interior';
  return 'post-pinched';
}

export function validatePostPinchingParameter(c: number) {
  if (!Number.isFinite(c) || c <= ALGEBRAIC_MIN_C || c >= ALGEBRAIC_MAX_C) throw new RangeError('The post-pinching algebraic mode uses a finite real parameter −1 < c < 3.');
}

export function validateRamifiedParameter(c: number) {
  if (!Number.isFinite(c) || (c > ALGEBRAIC_MIN_C && c < ALGEBRAIC_MAX_C)) throw new RangeError('The ramified exploratory mode uses a finite real parameter c ≤ −1 or c ≥ 3.');
}

export function spherePointIsFinite(point: SpherePoint): point is { kind: 'finite'; value: Complex } {
  return point.kind === 'finite';
}

export function reciprocalSpherePoint(point: SpherePoint): SpherePoint {
  if (point.kind === 'infinity') return finiteSpherePoint(complex(0));
  if (absComplex(point.value) === 0) return SPHERE_INFINITY;
  return finiteSpherePoint(reciprocalComplex(point.value));
}

export function sphereChordalDistance(a: SpherePoint, b: SpherePoint): number {
  if (a.kind === 'infinity' && b.kind === 'infinity') return 0;
  if (a.kind === 'infinity' && b.kind === 'finite') return 1 / Math.sqrt(1 + absComplex(b.value) ** 2);
  if (a.kind === 'finite' && b.kind === 'infinity') return 1 / Math.sqrt(1 + absComplex(a.value) ** 2);
  return chordalDistance((a as { kind: 'finite'; value: Complex }).value, (b as { kind: 'finite'; value: Complex }).value);
}

export function evaluateCorrespondenceOnSphere(point: SpherePoint, c: number): SpherePoint | null {
  if (!Number.isFinite(c)) return null;
  if (point.kind === 'infinity' || absComplex(point.value) === 0) return SPHERE_INFINITY;
  const value = correspondenceR(point.value, c);
  return finiteComplex(value) ? finiteSpherePoint(value) : null;
}

export type CriticalDatum = {
  id: string;
  point: SpherePoint;
  value: SpherePoint;
  derivativeMultiplicity: number;
  onUnitCircle: boolean;
  source: 'finite' | 'pole';
  valueClusterId: number;
};

function additionalCriticalSquares(c: number): Complex[] {
  const halfTrace = (c - 1) / 2;
  if (Math.abs(halfTrace) <= 1) {
    const angle = Math.acos(Math.max(-1, Math.min(1, halfTrace)));
    return [{ re: Math.cos(angle), im: Math.sin(angle) }, { re: Math.cos(angle), im: -Math.sin(angle) }];
  }
  const large = Math.sign(halfTrace) * (Math.abs(halfTrace) + Math.sqrt(halfTrace * halfTrace - 1));
  return [complex(large), complex(1 / large)];
}

/** All finite critical points, with collisions represented by multiplicity, plus
 * the order-five pole at zero as a separate projective critical datum. */
export function correspondenceCriticalData(c: number): CriticalDatum[] {
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be finite.');
  const candidates: { point: Complex; multiplicity: number }[] = [
    { point: complex(1), multiplicity: 1 },
    { point: complex(-1), multiplicity: 1 },
  ];
  for (const square of additionalCriticalSquares(c)) {
    const root = sqrtComplex(square);
    candidates.push({ point: root, multiplicity: 1 }, { point: scaleComplex(root, -1), multiplicity: 1 });
  }
  const merged: { point: Complex; multiplicity: number }[] = [];
  for (const candidate of candidates) {
    const existing = merged.find(item => chordalDistance(item.point, candidate.point) <= 2e-10);
    if (existing) existing.multiplicity += candidate.multiplicity;
    else merged.push({ ...candidate });
  }
  const values = merged.map(item => correspondenceR(item.point, c));
  const valueCentres: Complex[] = [];
  const valueClusters = values.map(value => {
    const existing = valueCentres.findIndex(centre => chordalDistance(centre, value) <= 2e-9);
    if (existing >= 0) return existing;
    valueCentres.push(value);
    return valueCentres.length - 1;
  });
  const result = merged.map((item, index): CriticalDatum => ({
    id: `critical-${index + 1}`,
    point: finiteSpherePoint(item.point),
    value: finiteSpherePoint(values[index]),
    derivativeMultiplicity: item.multiplicity,
    onUnitCircle: Math.abs(absComplex(item.point) - 1) <= 2e-10,
    source: 'finite',
    valueClusterId: valueClusters[index],
  }));
  result.push({ id: 'critical-pole', point: finiteSpherePoint(complex(0)), value: SPHERE_INFINITY, derivativeMultiplicity: 4, onUnitCircle: false, source: 'pole', valueClusterId: valueCentres.length });
  return result;
}

export type CircleIntersection = {
  point: Complex;
  firstSegment: number;
  secondSegment: number;
  firstParameter: number;
  secondParameter: number;
  kind: 'crossing' | 'contact';
};
export type CircleImage = {
  c: number;
  points: Complex[];
  rows: number[][];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  margin: number;
  intersections: CircleIntersection[];
};

const cross = (a: Complex, b: Complex) => a.re * b.im - a.im * b.re;

function segmentIntersection(a: Complex, b: Complex, c: Complex, d: Complex) {
  const r = subtractComplex(b, a), s = subtractComplex(d, c), denominator = cross(r, s);
  const scale = Math.max(1, absComplex(r), absComplex(s));
  if (Math.abs(denominator) <= 2e-13 * scale * scale) return null;
  const offset = subtractComplex(c, a);
  const t = cross(offset, s) / denominator, u = cross(offset, r) / denominator;
  if (t < -2e-10 || t > 1 + 2e-10 || u < -2e-10 || u > 1 + 2e-10) return null;
  return { point: addComplex(a, scaleComplex(r, Math.max(0, Math.min(1, t)))), t, u, sine: Math.abs(denominator) / Math.max(Number.EPSILON, absComplex(r) * absComplex(s)) };
}

export function findCircleImageIntersections(points: Complex[], margin: number): CircleIntersection[] {
  const count = points.length;
  if (count < 4) return [];
  const minX = Math.min(...points.map(point => point.re)), maxX = Math.max(...points.map(point => point.re));
  const minY = Math.min(...points.map(point => point.im)), maxY = Math.max(...points.map(point => point.im));
  const bins = Math.max(8, Math.min(96, Math.ceil(Math.sqrt(count))));
  const cells: number[][] = Array.from({ length: bins * bins }, () => []);
  const xbin = (x: number) => Math.max(0, Math.min(bins - 1, Math.floor((x - minX) / Math.max(Number.EPSILON, maxX - minX) * bins)));
  const ybin = (y: number) => Math.max(0, Math.min(bins - 1, Math.floor((y - minY) / Math.max(Number.EPSILON, maxY - minY) * bins)));
  for (let index = 0; index < count; index++) {
    const a = points[index], b = points[(index + 1) % count];
    for (let y = ybin(Math.min(a.im, b.im) - margin); y <= ybin(Math.max(a.im, b.im) + margin); y++) {
      for (let x = xbin(Math.min(a.re, b.re) - margin); x <= xbin(Math.max(a.re, b.re) + margin); x++) cells[y * bins + x].push(index);
    }
  }
  const candidates = new Set<string>();
  for (const cell of cells) for (let a = 0; a < cell.length; a++) for (let b = a + 1; b < cell.length; b++) {
    const first = Math.min(cell[a], cell[b]), second = Math.max(cell[a], cell[b]);
    if (first === second || second - first <= 1 || (first === 0 && second === count - 1)) continue;
    candidates.add(`${first}:${second}`);
  }
  const intersections: CircleIntersection[] = [];
  for (const pair of candidates) {
    const [first, second] = pair.split(':').map(Number);
    const hit = segmentIntersection(points[first], points[(first + 1) % count], points[second], points[(second + 1) % count]);
    if (!hit) continue;
    const duplicate = intersections.find(item => absComplex(subtractComplex(item.point, hit.point)) <= Math.max(8 * margin, 2e-8));
    if (duplicate) {
      if (hit.sine > 1e-5 && hit.t > 1e-5 && hit.t < 1 - 1e-5 && hit.u > 1e-5 && hit.u < 1 - 1e-5) duplicate.kind = 'crossing';
      continue;
    }
    intersections.push({
      point: hit.point,
      firstSegment: first,
      secondSegment: second,
      firstParameter: 2 * Math.PI * (first + hit.t) / count,
      secondParameter: 2 * Math.PI * (second + hit.u) / count,
      kind: hit.sine > 1e-5 && hit.t > 1e-5 && hit.t < 1 - 1e-5 && hit.u > 1e-5 && hit.u < 1 - 1e-5 ? 'crossing' : 'contact',
    });
  }
  return intersections;
}

export function createCircleImage(c: number, segments = 2048): CircleImage {
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be finite.');
  if (!Number.isFinite(segments)) throw new RangeError('The circle-image resolution must be finite.');
  const count = Math.max(128, Math.min(16384, 8 * Math.ceil(segments / 8)));
  const points = Array.from({ length: count }, (_, index) => {
    const angle = 2 * Math.PI * index / count;
    return correspondenceR({ re: Math.cos(angle), im: Math.sin(angle) }, c);
  });
  const margin = (6 + 4 * Math.abs(c)) * (2 * Math.PI / count) ** 2 / 8 + 2e-10;
  const minX = Math.min(...points.map(point => point.re)) - 2 * margin;
  const maxX = Math.max(...points.map(point => point.re)) + 2 * margin;
  const minY = Math.min(...points.map(point => point.im)) - 2 * margin;
  const maxY = Math.max(...points.map(point => point.im)) + 2 * margin;
  const rows: number[][] = Array.from({ length: 512 }, () => []);
  const bin = (y: number) => Math.max(0, Math.min(rows.length - 1, Math.floor((y - minY) / Math.max(Number.EPSILON, maxY - minY) * rows.length)));
  for (let index = 0; index < count; index++) {
    const a = points[index], b = points[(index + 1) % count];
    for (let row = bin(Math.min(a.im, b.im) - margin); row <= bin(Math.max(a.im, b.im) + margin); row++) rows[row].push(index);
  }
  return { c, points, rows, minX, maxX, minY, maxY, margin, intersections: findCircleImageIntersections(points, margin) };
}

function pointSegmentDistance(point: Complex, a: Complex, b: Complex) {
  const difference = subtractComplex(b, a), length2 = difference.re * difference.re + difference.im * difference.im;
  const t = length2 ? Math.max(0, Math.min(1, ((point.re - a.re) * difference.re + (point.im - a.im) * difference.im) / length2)) : 0;
  return absComplex(subtractComplex(point, addComplex(a, scaleComplex(difference, t))));
}

export type WindingResult = { winding: number | null; reason: 'cell' | 'boundary' | 'nonfinite' };

export function locateWindingCell(point: Complex, curve: CircleImage): WindingResult {
  if (!finiteComplex(point)) return { winding: null, reason: 'nonfinite' };
  if (point.im < curve.minY || point.im > curve.maxY || point.re < curve.minX || point.re > curve.maxX) return { winding: 0, reason: 'cell' };
  const row = Math.max(0, Math.min(curve.rows.length - 1, Math.floor((point.im - curve.minY) / Math.max(Number.EPSILON, curve.maxY - curve.minY) * curve.rows.length)));
  let winding = 0;
  for (const index of curve.rows[row]) {
    const a = curve.points[index], b = curve.points[(index + 1) % curve.points.length];
    if (pointSegmentDistance(point, a, b) <= curve.margin) return { winding: null, reason: 'boundary' };
    const side = cross(subtractComplex(b, a), subtractComplex(point, a));
    if (a.im <= point.im && b.im > point.im && side > 0) winding++;
    else if (a.im > point.im && b.im <= point.im && side < 0) winding--;
  }
  return { winding, reason: 'cell' };
}

export type WindingGrid = {
  c: number;
  view: PlaneView;
  size: number;
  curve: CircleImage;
  windings: Int8Array;
  ambiguous: Uint8Array;
  counts: Record<string, number>;
};

export function renderWindingGrid(c: number, view: PlaneView, size: number, onProgress?: (progress: number) => void): WindingGrid {
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be finite.');
  if (!Number.isInteger(size) || size < 1 || size > 1536) throw new RangeError('Winding-grid size must be an integer from 1 to 1536.');
  if (![view.re, view.im, view.span].every(Number.isFinite) || view.span <= 0) throw new RangeError('The winding-grid view must be finite and have positive width.');
  const target = view.span / (4 * size);
  const segments = Math.max(1024, Math.ceil(2 * Math.PI * Math.sqrt((6 + 4 * Math.abs(c)) / Math.max(8 * target, Number.EPSILON))));
  const curve = createCircleImage(c, segments);
  const windings = new Int8Array(size * size), ambiguous = new Uint8Array(size * size), counts: Record<string, number> = {};
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const point = { re: view.re + ((x + 0.5) / size - 0.5) * view.span, im: view.im + (0.5 - (y + 0.5) / size) * view.span };
      const result = locateWindingCell(point, curve), index = y * size + x;
      if (result.winding === null) { ambiguous[index] = 1; counts.ambiguous = (counts.ambiguous ?? 0) + 1; }
      else { windings[index] = result.winding; counts[String(result.winding)] = (counts[String(result.winding)] ?? 0) + 1; }
    }
    if (y % 8 === 0) onProgress?.((y + 1) / size);
  }
  onProgress?.(1);
  return { c, view, size, curve, windings, ambiguous, counts };
}

export function correspondenceFibrePolynomial(w: Complex, c: number): Complex[] {
  return [complex(15), scaleComplex(w, -15), complex(15 * c), complex(0), complex(-5 * c), complex(0), complex(3)];
}

export function correspondenceReciprocalFibrePolynomial(w: Complex, c: number): Complex[] {
  return [complex(3), complex(0), complex(-5 * c), complex(0), complex(15 * c), scaleComplex(w, -15), complex(15)];
}

/** Coefficients, in descending powers of y, of the bidegree-(5,5)
 * correspondence after the trivial factor xy-1 has been removed. */
export function correspondenceRelationPolynomial(x: Complex, c: number): Complex[] {
  const x2 = multiplyComplex(x, x), x3 = multiplyComplex(x2, x), x4 = multiplyComplex(x2, x2), x5 = multiplyComplex(x4, x);
  return [
    scaleComplex(x4, -3),
    scaleComplex(x3, -3),
    addComplex(scaleComplex(x4, 5 * c), scaleComplex(x2, -3)),
    addComplex(scaleComplex(x3, 5 * c), scaleComplex(x, -3)),
    addComplex(addComplex(scaleComplex(x4, -15 * c), scaleComplex(x2, 5 * c)), complex(-3)),
    scaleComplex(x5, 15),
  ];
}

export type CorrespondenceImage = {
  id: string;
  zeta: SpherePoint;
  y: SpherePoint;
  multiplicity: number;
  fibreResidual: number;
  relationResidual: number;
  nearMultiple: boolean;
  clusterId: number;
};
export type CorrespondenceFibre = {
  c: number;
  x: SpherePoint;
  w: SpherePoint;
  allSixRoots: AllRootsResult | null;
  relationRoots: AllRootsResult | null;
  trivialRootRemoved: boolean;
  images: CorrespondenceImage[];
  distinctImageCount: number;
  totalMultiplicity: number;
  status: 'residual-checked' | 'near-multiple' | 'projective-special' | 'unresolved';
  diagnostics: { residualTolerance: number; clusterTolerance: number; crossChartAgreement: number };
};

const unresolvedRoots = (): AllRootsResult => ({ degree: 0, roots: [], clusters: [], complete: false, method: 'aberth', maxScaledResidual: Infinity, vietaError: Infinity, reason: 'invalid-polynomial' });

function bestMatchingDistance(first: Complex[], second: Complex[]) {
  if (first.length !== second.length) return Infinity;
  const used = new Array(second.length).fill(false);
  let best = Infinity;
  const search = (index: number, maximum: number) => {
    if (maximum >= best) return;
    if (index === first.length) { best = maximum; return; }
    for (let j = 0; j < second.length; j++) if (!used[j]) {
      used[j] = true;
      search(index + 1, Math.max(maximum, chordalDistance(first[index], second[j])));
      used[j] = false;
    }
  };
  search(0, 0);
  return best;
}

function specialFibre(c: number, x: SpherePoint, images: { y: SpherePoint; multiplicity: number }[]): CorrespondenceFibre {
  const w = evaluateCorrespondenceOnSphere(x, c) ?? SPHERE_INFINITY;
  const mapped = images.map((image, index): CorrespondenceImage => ({ id: `sheet-${index + 1}`, zeta: reciprocalSpherePoint(image.y), y: image.y, multiplicity: image.multiplicity, fibreResidual: 0, relationResidual: 0, nearMultiple: image.multiplicity > 1, clusterId: index }));
  return { c, x, w, allSixRoots: null, relationRoots: null, trivialRootRemoved: false, images: mapped, distinctImageCount: mapped.length, totalMultiplicity: mapped.reduce((sum, image) => sum + image.multiplicity, 0), status: 'projective-special', diagnostics: { residualTolerance: 2e-10, clusterTolerance: 2e-7, crossChartAgreement: 0 } };
}

/** Computes all five images of x, counted with multiplicity. No returned image
 * is treated as canonical. Incomplete or inconsistent root sets are unresolved. */
export function solveCorrespondenceFibre(x: SpherePoint, c: number): CorrespondenceFibre {
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be finite.');
  if (x.kind === 'infinity') return specialFibre(c, x, [{ y: SPHERE_INFINITY, multiplicity: 5 }]);
  if (!finiteComplex(x.value)) return { c, x, w: SPHERE_INFINITY, allSixRoots: unresolvedRoots(), relationRoots: null, trivialRootRemoved: false, images: [], distinctImageCount: 0, totalMultiplicity: 0, status: 'unresolved', diagnostics: { residualTolerance: 2e-10, clusterTolerance: 2e-7, crossChartAgreement: Infinity } };
  if (absComplex(x.value) === 0) return specialFibre(c, x, [{ y: finiteSpherePoint(complex(0)), multiplicity: 1 }, { y: SPHERE_INFINITY, multiplicity: 4 }]);
  const w = correspondenceR(x.value, c);
  if (!finiteComplex(w)) return { c, x, w: SPHERE_INFINITY, allSixRoots: unresolvedRoots(), relationRoots: null, trivialRootRemoved: false, images: [], distinctImageCount: 0, totalMultiplicity: 0, status: 'unresolved', diagnostics: { residualTolerance: 2e-10, clusterTolerance: 2e-7, crossChartAgreement: Infinity } };
  const residualTolerance = 2e-10, clusterTolerance = 2e-7;
  const allSixRoots = solveAllPolynomialRoots(correspondenceFibrePolynomial(w, c), { residualTolerance, clusterTolerance });
  const relationCoefficients = correspondenceRelationPolynomial(x.value, c);
  const relationRoots = solveAllPolynomialRoots(relationCoefficients, { residualTolerance, clusterTolerance });
  const derivativeIsZero = absComplex(correspondenceDerivative(x.value, c)) <= 2e-9;
  const critical = derivativeIsZero ? correspondenceCriticalData(c).find(datum => datum.source === 'finite' && datum.point.kind === 'finite' && chordalDistance(datum.point.value, x.value) <= 2e-8) : undefined;
  const distances = allSixRoots.roots.map(root => chordalDistance(root.value, x.value));
  const trivialIndex = distances.length ? distances.indexOf(Math.min(...distances)) : -1;
  const trivialTolerance = critical ? 1e-3 : Math.max(2e-6, 32 * Math.sqrt(Math.max(allSixRoots.maxScaledResidual, Number.EPSILON)));
  const trivialRootRemoved = trivialIndex >= 0 && distances[trivialIndex] <= trivialTolerance;
  const retained = allSixRoots.roots.filter((_, index) => index !== trivialIndex || !trivialRootRemoved);
  const criticalRootIndices = new Set<number>();
  if (critical) distances.map((distance, index) => ({ distance, index })).sort((a, b) => a.distance - b.distance).slice(0, critical.derivativeMultiplicity + 1).forEach(item => criticalRootIndices.add(item.index));
  const groups = new Map<number, typeof retained>();
  for (const root of retained) {
    const originalIndex = allSixRoots.roots.indexOf(root);
    const key = criticalRootIndices.has(originalIndex) ? -1 : root.clusterId;
    groups.set(key, [...(groups.get(key) ?? []), root]);
  }
  const images: CorrespondenceImage[] = [];
  for (const [clusterId, members] of groups) {
    const centre = clusterId === -1 ? x.value : scaleComplex(members.reduce((sum, root) => addComplex(sum, root.value), complex(0)), 1 / members.length);
    const y = reciprocalComplex(centre);
    images.push({
      id: '',
      zeta: finiteSpherePoint(centre),
      y: finiteSpherePoint(y),
      multiplicity: members.length,
      fibreResidual: Math.max(...members.map(root => root.scaledResidual)),
      relationResidual: scaledPolynomialResidual(relationCoefficients, y),
      nearMultiple: clusterId === -1 || members.length > 1 || allSixRoots.clusters[clusterId]?.minimumSeparation < 2e-5,
      clusterId,
    });
  }
  images.sort((a, b) => {
    const av = (a.y as { kind: 'finite'; value: Complex }).value, bv = (b.y as { kind: 'finite'; value: Complex }).value;
    return Math.atan2(av.im, av.re) - Math.atan2(bv.im, bv.re) || absComplex(av) - absComplex(bv);
  });
  images.forEach((image, index) => { image.id = `sheet-${index + 1}`; });
  const expandedImages = images.flatMap(image => Array.from({ length: image.multiplicity }, () => (image.y as { kind: 'finite'; value: Complex }).value));
  const relationValues = relationRoots.roots.map(root => root.value);
  const crossChartAgreement = bestMatchingDistance(expandedImages, relationValues);
  const totalMultiplicity = images.reduce((sum, image) => sum + image.multiplicity, 0);
  const maxRelationResidual = images.length ? Math.max(...images.map(image => image.relationResidual)) : Infinity;
  const allSixAccounted = allSixRoots.complete || Boolean(critical && allSixRoots.roots.length === 6 && allSixRoots.maxScaledResidual <= residualTolerance);
  const complete = allSixAccounted && relationRoots.complete && trivialRootRemoved && totalMultiplicity === 5 && crossChartAgreement <= 2e-5 && maxRelationResidual <= residualTolerance;
  const nearMultiple = images.some(image => image.nearMultiple);
  return {
    c,
    x,
    w: finiteSpherePoint(w),
    allSixRoots,
    relationRoots,
    trivialRootRemoved,
    images: complete ? images : [],
    distinctImageCount: complete ? images.length : 0,
    totalMultiplicity: complete ? totalMultiplicity : 0,
    status: complete ? nearMultiple ? 'near-multiple' : 'residual-checked' : 'unresolved',
    diagnostics: { residualTolerance, clusterTolerance, crossChartAgreement },
  };
}

export type BranchLabelMatch = { previousId: string; nextId: string; distance: number; reliable: boolean };

/** Local nearest matching for colours only. It is not used by any orbit or
 * membership calculation and is not a global branch continuation. */
export function matchBranchLabels(previous: CorrespondenceImage[], next: CorrespondenceImage[]): BranchLabelMatch[] {
  const candidates: { previous: CorrespondenceImage; next: CorrespondenceImage; distance: number }[] = [];
  for (const before of previous) for (const after of next) candidates.push({ previous: before, next: after, distance: sphereChordalDistance(before.y, after.y) });
  candidates.sort((a, b) => a.distance - b.distance);
  const usedPrevious = new Set<string>(), usedNext = new Set<string>(), matches: BranchLabelMatch[] = [];
  for (const candidate of candidates) if (!usedPrevious.has(candidate.previous.id) && !usedNext.has(candidate.next.id)) {
    usedPrevious.add(candidate.previous.id); usedNext.add(candidate.next.id);
    matches.push({ previousId: candidate.previous.id, nextId: candidate.next.id, distance: candidate.distance, reliable: candidate.distance <= 0.08 && !candidate.previous.nearMultiple && !candidate.next.nearMultiple });
  }
  return matches;
}

export function conjugateSpherePoint(point: SpherePoint): SpherePoint {
  return point.kind === 'infinity' ? point : finiteSpherePoint(conjugateComplex(point.value));
}

export function relationIdentityResidual(x: Complex, y: Complex, c: number) {
  const x2 = integerPower(x, 2), x4 = integerPower(x, 4), x5 = integerPower(x, 5), x6 = integerPower(x, 6);
  const y2 = integerPower(y, 2), y4 = integerPower(y, 4), y6 = integerPower(y, 6);
  const a = addComplex(addComplex(addComplex(scaleComplex(x6, 15), scaleComplex(x4, 15 * c)), scaleComplex(x2, -5 * c)), complex(3));
  const reflected = addComplex(addComplex(addComplex(scaleComplex(y6, 3), scaleComplex(y4, -5 * c)), scaleComplex(y2, 15 * c)), complex(15));
  const left = multiplyComplex(subtractComplex(multiplyComplex(x, y), complex(1)), (() => {
    const coefficients = correspondenceRelationPolynomial(x, c);
    let value = coefficients[0];
    for (let i = 1; i < coefficients.length; i++) value = addComplex(multiplyComplex(value, y), coefficients[i]);
    return value;
  })());
  const right = subtractComplex(multiplyComplex(y, a), multiplyComplex(x5, reflected));
  return absComplex(subtractComplex(left, right)) / (1 + absComplex(left) + absComplex(right));
}
