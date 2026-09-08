import type { CorrespondenceGrid, SetResult } from './correspondence';

export type CorrespondenceLayer = 'limit' | 'tiling' | 'non-escaping';
export const CORRESPONDENCE_FORMULA = String.raw`R_c(z)=z+\frac{c}{z}-\frac{c}{3z^3}+\frac{1}{5z^5}`;
export const CORRESPONDENCE_RELATION = String.raw`\mathfrak C_c:\quad\frac{R_c(x)-R_c(1/y)}{x-1/y}=0`;
const TILING_PALETTE: [number, number, number][] = [[211, 234, 219], [120, 191, 175], [53, 148, 150], [35, 110, 135], [48, 77, 113], [102, 65, 106], [172, 84, 83], [214, 143, 92]];

export function correspondenceColour(grid: CorrespondenceGrid, index: number, layer: CorrespondenceLayer): [number, number, number] {
  const kind = grid.kinds[index];
  if (kind === 0) return [170, 178, 185];
  if (layer === 'limit') return grid.boundary[index] ? [176, 82, 37] : [252, 250, 246];
  if (layer === 'non-escaping') return kind === 1 ? [37, 65, 84] : [252, 250, 246];
  if (kind !== 2) return [252, 250, 246];
  return TILING_PALETTE[Math.min(grid.depths[index], TILING_PALETTE.length - 1)];
}

export function describeCorrespondencePoint(result: SetResult): string {
  if (result.kind === 1) return `Non-escaping interior: the associated orbit is in the infinity basin (detected after ${result.depth} ${result.depth === 1 ? 'step' : 'steps'}).`;
  if (result.kind === 2) return result.depth === 0 ? 'Tiling set: its image under R_c is in the fundamental tile.' : `Tiling set: the associated orbit reaches the fundamental tile after ${result.depth} ${result.depth === 1 ? 'step' : 'steps'}.`;
  if (result.reason === 'boundary') return 'Unresolved: the associated orbit is too close to a tile boundary for this numerical test.';
  if (result.reason === 'inverse') return 'Unresolved: the exterior inverse could not be computed with sufficient confidence.';
  return `Unresolved after ${result.depth} steps. Increase the iteration depth to investigate further.`;
}
