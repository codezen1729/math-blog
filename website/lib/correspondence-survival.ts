import type { PlaneView } from './dynamics';
import {
  SPHERE_INFINITY,
  finiteSpherePoint,
  solveCorrespondenceFibre,
  sphereChordalDistance,
} from './correspondence-algebraic.ts';
import type { SpherePoint } from './correspondence-algebraic';

export const SURVIVAL_UNRESOLVED = 0;
export const SURVIVAL_ALL = 1;
export const SURVIVAL_SOME = 2;
export const SURVIVAL_NONE = 3;
export type SurvivalKind = typeof SURVIVAL_UNRESOLVED | typeof SURVIVAL_ALL | typeof SURVIVAL_SOME | typeof SURVIVAL_NONE;
export type SurvivalReason = 'complete' | 'solver' | 'boundary' | 'node-cap' | 'singular';

export type OrbitNode = {
  id: number;
  value: SpherePoint;
  depth: number;
  status: 'inside' | 'escaped' | 'unresolved' | 'capped';
};
export type OrbitEdge = {
  from: number;
  to: number;
  sheetId: string;
  multiplicity: number;
  residual: number;
};
export type OrbitTree = {
  c: number;
  root: SpherePoint;
  view: PlaneView;
  nodes: OrbitNode[];
  edges: OrbitEdge[];
  requestedDepth: number;
  computedDepth: number;
  nodeCap: number;
  dedupTolerance: number;
  complete: boolean;
  stopReason?: 'solver' | 'node-cap' | 'singular';
};
export type OrbitTreeRequest = {
  c: number;
  root: SpherePoint;
  view: PlaneView;
  depth: number;
  nodeCap?: number;
  dedupTolerance?: number;
  boundaryTolerance?: number;
};

type RegionPosition = 'inside' | 'outside' | 'boundary' | 'singular';

function validateView(view: PlaneView) {
  if (![view.re, view.im, view.span].every(Number.isFinite) || view.span <= 0) throw new RangeError('The finite-depth viewing region must be finite and have positive width.');
}

export function locateInViewingRegion(point: SpherePoint, view: PlaneView, tolerance = Math.max(1e-12, view.span * 1e-10)): RegionPosition {
  if (point.kind === 'infinity') return 'outside';
  if (!Number.isFinite(point.value.re) || !Number.isFinite(point.value.im)) return 'singular';
  const half = view.span / 2;
  const dx = half - Math.abs(point.value.re - view.re), dy = half - Math.abs(point.value.im - view.im);
  if (dx < -tolerance || dy < -tolerance) return 'outside';
  if (dx <= tolerance || dy <= tolerance) return 'boundary';
  return 'inside';
}

function addOrReuseNode(nodes: OrbitNode[], candidates: number[], value: SpherePoint, depth: number, status: OrbitNode['status'], tolerance: number) {
  const existing = candidates.find(id => nodes[id].status === status && sphereChordalDistance(nodes[id].value, value) <= tolerance);
  if (existing !== undefined) return existing;
  const id = nodes.length;
  nodes.push({ id, value, depth, status });
  candidates.push(id);
  return id;
}

/** A finite tree of every residual-checked correspondence image. Nodes may be
 * merged within one depth, but all incoming edges and multiplicities remain. */
export function buildCorrespondenceOrbitTree(request: OrbitTreeRequest): OrbitTree {
  const { c, root, view, depth } = request;
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be finite.');
  validateView(view);
  if (!Number.isInteger(depth) || depth < 0 || depth > 8) throw new RangeError('Orbit-tree depth must be an integer from 0 to 8.');
  const nodeCap = request.nodeCap ?? 5000, dedupTolerance = request.dedupTolerance ?? 2e-7;
  if (!Number.isInteger(nodeCap) || nodeCap < 2 || nodeCap > 50000) throw new RangeError('Orbit-tree node cap must be an integer from 2 to 50000.');
  if (!Number.isFinite(dedupTolerance) || dedupTolerance <= 0) throw new RangeError('Orbit-tree deduplication tolerance must be positive and finite.');
  const boundaryTolerance = request.boundaryTolerance ?? Math.max(1e-12, view.span * 1e-10);
  const rootPosition = locateInViewingRegion(root, view, boundaryTolerance);
  const rootStatus: OrbitNode['status'] = rootPosition === 'inside' ? 'inside' : rootPosition === 'outside' ? 'escaped' : 'unresolved';
  const nodes: OrbitNode[] = [{ id: 0, value: root, depth: 0, status: rootStatus }], edges: OrbitEdge[] = [];
  let frontier = rootStatus === 'inside' ? [0] : [], complete = rootPosition !== 'boundary' && rootPosition !== 'singular';
  let stopReason: OrbitTree['stopReason'] = rootPosition === 'singular' ? 'singular' : rootPosition === 'boundary' ? 'solver' : undefined;
  let computedDepth = 0;
  outer: for (let level = 1; level <= depth && frontier.length; level++) {
    const next: number[] = [];
    for (const parentId of frontier) {
      const parent = nodes[parentId], fibre = solveCorrespondenceFibre(parent.value, c);
      if (fibre.status === 'unresolved') {
        complete = false; stopReason ??= 'solver';
        const id = addOrReuseNode(nodes, next, parent.value, level, 'unresolved', dedupTolerance);
        edges.push({ from: parentId, to: id, sheetId: 'unresolved', multiplicity: 5, residual: Infinity });
        continue;
      }
      for (const image of fibre.images) {
        if (nodes.length >= nodeCap - 1) {
          const id = nodes.length;
          nodes.push({ id, value: image.y, depth: level, status: 'capped' });
          edges.push({ from: parentId, to: id, sheetId: image.id, multiplicity: image.multiplicity, residual: Math.max(image.fibreResidual, image.relationResidual) });
          complete = false; stopReason = 'node-cap'; computedDepth = level;
          break outer;
        }
        const position = locateInViewingRegion(image.y, view, boundaryTolerance);
        const status: OrbitNode['status'] = position === 'inside' ? 'inside' : position === 'outside' ? 'escaped' : 'unresolved';
        if (status === 'unresolved') { complete = false; stopReason ??= position === 'singular' ? 'singular' : 'solver'; }
        const id = addOrReuseNode(nodes, next, image.y, level, status, dedupTolerance);
        edges.push({ from: parentId, to: id, sheetId: image.id, multiplicity: image.multiplicity, residual: Math.max(image.fibreResidual, image.relationResidual) });
      }
    }
    computedDepth = level;
    frontier = next.filter(id => nodes[id].status === 'inside');
  }
  return { c, root, view, nodes, edges, requestedDepth: depth, computedDepth, nodeCap, dedupTolerance, complete, stopReason };
}

export type FiniteSurvivalResult = {
  kind: SurvivalKind;
  depth: number;
  reason: SurvivalReason;
  nodesVisited: number;
  existsThroughDepth: boolean | null;
  allThroughDepth: boolean | null;
};
export type FiniteSurvivalRequest = {
  c: number;
  root: SpherePoint;
  view: PlaneView;
  depth: number;
  nodeCap?: number;
  dedupTolerance?: number;
  boundaryTolerance?: number;
  branchSolver?: typeof solveCorrespondenceFibre;
};

function unresolved(depth: number, reason: Exclude<SurvivalReason, 'complete'>, nodesVisited: number): FiniteSurvivalResult {
  return { kind: SURVIVAL_UNRESOLVED, depth, reason, nodesVisited, existsThroughDepth: null, allThroughDepth: null };
}

function deduplicate(points: SpherePoint[], tolerance: number) {
  const result: SpherePoint[] = [];
  for (const point of points) if (!result.some(existing => sphereChordalDistance(existing, point) <= tolerance)) result.push(point);
  return result;
}

/** Classifies only survival in the displayed square through a finite depth.
 * It makes no assertion about an infinite non-escaping set. */
export function classifyFiniteBranchSurvival(request: FiniteSurvivalRequest): FiniteSurvivalResult {
  const { c, root, view, depth } = request;
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be finite.');
  validateView(view);
  if (!Number.isInteger(depth) || depth < 0 || depth > 8) throw new RangeError('Finite survival depth must be an integer from 0 to 8.');
  const nodeCap = request.nodeCap ?? 5000, dedupTolerance = request.dedupTolerance ?? 2e-7;
  if (!Number.isInteger(nodeCap) || nodeCap < 1 || nodeCap > 50000) throw new RangeError('Finite survival node cap must be an integer from 1 to 50000.');
  if (!Number.isFinite(dedupTolerance) || dedupTolerance <= 0) throw new RangeError('Finite survival deduplication tolerance must be positive and finite.');
  const boundaryTolerance = request.boundaryTolerance ?? Math.max(1e-12, view.span * 1e-10);
  const initial = locateInViewingRegion(root, view, boundaryTolerance);
  if (initial === 'singular') return unresolved(0, 'singular', 1);
  if (initial === 'boundary') return unresolved(0, 'boundary', 1);
  if (initial === 'outside') return { kind: SURVIVAL_NONE, depth: 0, reason: 'complete', nodesVisited: 1, existsThroughDepth: false, allThroughDepth: false };
  if (depth === 0) return { kind: SURVIVAL_ALL, depth: 0, reason: 'complete', nodesVisited: 1, existsThroughDepth: true, allThroughDepth: true };
  const branchSolver = request.branchSolver ?? solveCorrespondenceFibre;
  let frontier = [root], nodesVisited = 1, everyPathSurvives = true;
  for (let level = 1; level <= depth; level++) {
    const next: SpherePoint[] = [];
    for (const parent of frontier) {
      const fibre = branchSolver(parent, c);
      if (fibre.status === 'unresolved' || fibre.status === 'near-multiple') return unresolved(level - 1, 'solver', nodesVisited);
      for (const image of fibre.images) {
        nodesVisited += image.multiplicity;
        if (nodesVisited > nodeCap) return unresolved(level - 1, 'node-cap', nodesVisited);
        const position = locateInViewingRegion(image.y, view, boundaryTolerance);
        if (position === 'singular') return unresolved(level, 'singular', nodesVisited);
        if (position === 'boundary') return unresolved(level, 'boundary', nodesVisited);
        if (position === 'outside') everyPathSurvives = false;
        else next.push(image.y);
      }
    }
    if (!next.length) return { kind: SURVIVAL_NONE, depth: level, reason: 'complete', nodesVisited, existsThroughDepth: false, allThroughDepth: false };
    frontier = deduplicate(next, dedupTolerance);
  }
  return everyPathSurvives
    ? { kind: SURVIVAL_ALL, depth, reason: 'complete', nodesVisited, existsThroughDepth: true, allThroughDepth: true }
    : { kind: SURVIVAL_SOME, depth, reason: 'complete', nodesVisited, existsThroughDepth: true, allThroughDepth: false };
}

export type SurvivalGridRequest = {
  c: number;
  view: PlaneView;
  size: number;
  depth: number;
  nodeCap?: number;
  dedupTolerance?: number;
  boundaryTolerance?: number;
};
export type SurvivalGridChunk = { startRow: number; rowCount: number; kinds: Uint8Array; reasons: Uint8Array };
export type SurvivalGrid = SurvivalGridRequest & {
  nodeCap: number;
  dedupTolerance: number;
  kinds: Uint8Array;
  reasons: Uint8Array;
  counts: { all: number; some: number; none: number; unresolved: number; solverFailures: number; capped: number };
};

const REASON_CODE: Record<SurvivalReason, number> = { complete: 0, solver: 1, boundary: 2, 'node-cap': 3, singular: 4 };
export const MAX_SURVIVAL_RASTER_WORK = 2_000_000;

export function estimateSurvivalWork(size: number, depth: number) {
  const expandedPerPixel = depth === 0 ? 1 : (5 ** depth - 1) / 4;
  return size * size * expandedPerPixel;
}

/** Progressive finite-depth raster. A callback receives copied row chunks, so
 * a worker may transfer them while continuing the calculation. */
export function renderFiniteBranchSurvivalGrid(request: SurvivalGridRequest, onProgress?: (progress: number) => void, onChunk?: (chunk: SurvivalGridChunk) => void): SurvivalGrid {
  const { c, view, size, depth } = request;
  if (!Number.isFinite(c)) throw new RangeError('The correspondence parameter must be finite.');
  validateView(view);
  if (!Number.isInteger(size) || size < 1 || size > 512) throw new RangeError('Finite survival raster size must be an integer from 1 to 512.');
  if (!Number.isInteger(depth) || depth < 0 || depth > 6) throw new RangeError('Finite survival raster depth must be an integer from 0 to 6.');
  if (estimateSurvivalWork(size, depth) > MAX_SURVIVAL_RASTER_WORK) throw new RangeError('This resolution and depth exceed the visible finite-branch work budget. Lower one of them; branches will not be silently pruned.');
  const nodeCap = request.nodeCap ?? 5000, dedupTolerance = request.dedupTolerance ?? 2e-7;
  const kinds = new Uint8Array(size * size), reasons = new Uint8Array(size * size);
  const counts = { all: 0, some: 0, none: 0, unresolved: 0, solverFailures: 0, capped: 0 };
  const chunkRows = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const point = finiteSpherePoint({ re: view.re + ((x + 0.5) / size - 0.5) * view.span, im: view.im + (0.5 - (y + 0.5) / size) * view.span });
      const result = classifyFiniteBranchSurvival({ c, root: point, view, depth, nodeCap, dedupTolerance, boundaryTolerance: request.boundaryTolerance });
      const index = y * size + x;
      kinds[index] = result.kind; reasons[index] = REASON_CODE[result.reason];
      if (result.kind === SURVIVAL_ALL) counts.all++;
      else if (result.kind === SURVIVAL_SOME) counts.some++;
      else if (result.kind === SURVIVAL_NONE) counts.none++;
      else { counts.unresolved++; if (result.reason === 'solver') counts.solverFailures++; if (result.reason === 'node-cap') counts.capped++; }
    }
    if ((y + 1) % chunkRows === 0 || y === size - 1) {
      const startRow = y - (y % chunkRows), rowCount = y - startRow + 1;
      const start = startRow * size, end = (startRow + rowCount) * size;
      onChunk?.({ startRow, rowCount, kinds: kinds.slice(start, end), reasons: reasons.slice(start, end) });
      onProgress?.((y + 1) / size);
    }
  }
  return { ...request, nodeCap, dedupTolerance, kinds, reasons, counts };
}

export function unresolvedOrbitPlaceholder(): SpherePoint {
  return SPHERE_INFINITY;
}
