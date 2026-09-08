import type { CorrespondenceFibre, CorrespondenceMode, ParameterBand, WindingGrid } from './correspondence-algebraic';
import type { FiniteSurvivalResult, SurvivalGrid } from './correspondence-survival';
import { SURVIVAL_ALL, SURVIVAL_NONE, SURVIVAL_SOME } from './correspondence-survival.ts';

export const CORRESPONDENCE_FIBRE_FORMULA = String.raw`15\zeta^6-15w\zeta^5+15c\zeta^4-5c\zeta^2+3=0`;
export const CORRESPONDENCE_EXISTS_FORMULA = String.raw`K_{\exists}^{(N)}=\{z:\text{some branch remains in the viewing region through depth }N\}`;
export const CORRESPONDENCE_ALL_FORMULA = String.raw`K_{\mathrm{all}}^{(N)}=\{z:\text{every branch remains in the viewing region through depth }N\}`;

export const CORRESPONDENCE_MODE_BADGES: Record<CorrespondenceMode, string> = {
  'verified-round': 'Verified round model',
  'post-pinching': 'Pinched/post-pinched algebraic model',
  ramified: 'Ramified exploratory model',
};

export const RAMIFIED_MODE_CAUTION = 'Finite critical points have left the unit circle, or are at the ramification transition. No mating, tiling-set, non-escaping-set, or limit-set interpretation is asserted.';
export const BRANCH_TRACKING_CAUTION = 'Sheet colours are matched only between nearby displayed parameters as a visual aid. They do not define global branches.';
export const FINITE_DEPTH_CAUTION = 'These colours answer a finite-depth question in the displayed square. They do not certify an infinite non-escaping set.';

export function describeParameterBand(band: ParameterBand) {
  if (band === 'round-interior') return 'All-branch comparison inside the round range.';
  if (band === 'pinched-endpoint') return 'Pinched threshold c = ±3/5.';
  if (band === 'post-pinched') return 'Post-pinching algebraic range; several inverse sheets may compete.';
  if (band === 'ramification-transition') return 'Ramification transition c = −1 or c = 3.';
  return 'Ramified exploratory range; finite critical points occur away from the unit circle.';
}

export type SurvivalLayer = 'combined' | 'existential' | 'universal';

export function survivalColour(grid: SurvivalGrid, index: number, layer: SurvivalLayer): [number, number, number] {
  const kind = grid.kinds[index];
  if (kind === 0) return [170, 178, 185];
  if (layer === 'existential') return kind === SURVIVAL_NONE ? [245, 226, 197] : [34, 120, 122];
  if (layer === 'universal') return kind === SURVIVAL_ALL ? [92, 67, 126] : [238, 226, 239];
  if (kind === SURVIVAL_ALL) return [49, 69, 119];
  if (kind === SURVIVAL_SOME) return [48, 145, 143];
  return [204, 126, 61];
}

const POSITIVE_WINDING: [number, number, number][] = [[220, 239, 226], [147, 207, 190], [66, 157, 154], [34, 109, 133], [48, 77, 113]];
const NEGATIVE_WINDING: [number, number, number][] = [[246, 226, 208], [226, 177, 133], [199, 123, 91], [157, 82, 91], [105, 63, 103]];

export function windingColour(grid: WindingGrid, index: number): [number, number, number] {
  if (grid.ambiguous[index]) return [170, 178, 185];
  const winding = grid.windings[index];
  if (winding === 0) return [252, 250, 246];
  const palette = winding > 0 ? POSITIVE_WINDING : NEGATIVE_WINDING;
  return palette[Math.min(Math.abs(winding), palette.length) - 1];
}

export function describeFiniteSurvival(result: FiniteSurvivalResult) {
  if (result.kind === SURVIVAL_ALL) return `All branches survive in the displayed region through depth ${result.depth}.`;
  if (result.kind === SURVIVAL_SOME) return `Some, but not all, branches survive in the displayed region through depth ${result.depth}.`;
  if (result.kind === SURVIVAL_NONE) return `All branches escape the displayed region before depth ${result.depth}.`;
  if (result.reason === 'node-cap') return `Numerically unresolved: the visible node cap was reached before depth ${result.depth + 1}.`;
  if (result.reason === 'boundary') return `Numerically unresolved: a branch is too close to the boundary of the displayed region at depth ${result.depth}.`;
  if (result.reason === 'singular') return `Numerically unresolved: projective or non-finite arithmetic was encountered at depth ${result.depth}.`;
  return `Numerically unresolved: not every inverse sheet passed the residual checks through depth ${result.depth}.`;
}

export function describeCorrespondenceFibre(fibre: CorrespondenceFibre) {
  if (fibre.status === 'projective-special') return `${fibre.totalMultiplicity} projective images counted with multiplicity in a pole or infinity fibre.`;
  if (fibre.status === 'unresolved') return 'Numerically unresolved: the two all-roots calculations did not account for the same five correspondence images with sufficient residual accuracy.';
  const residual = Math.max(0, ...fibre.images.map(image => Math.max(image.fibreResidual, image.relationResidual)));
  const collision = fibre.status === 'near-multiple' ? ' Near-multiple sheets are grouped and their multiplicities are shown.' : '';
  return `${fibre.totalMultiplicity} images counted with multiplicity at ${fibre.distinctImageCount} numerical locations; maximum scaled residual ${residual.toExponential(2)}.${collision}`;
}
