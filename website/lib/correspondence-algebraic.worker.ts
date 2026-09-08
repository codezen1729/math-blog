import type { PlaneView } from './dynamics';
import type { SpherePoint } from './correspondence-algebraic';
import { renderWindingGrid } from './correspondence-algebraic.ts';
import { buildCorrespondenceOrbitTree, renderFiniteBranchSurvivalGrid } from './correspondence-survival.ts';

type WindingRequest = { requestId: number; type: 'winding'; c: number; view: PlaneView; size: number };
type TreeRequest = { requestId: number; type: 'tree'; c: number; root: SpherePoint; view: PlaneView; depth: number; nodeCap?: number; dedupTolerance?: number };
type SurvivalRequest = { requestId: number; type: 'survival'; c: number; view: PlaneView; size: number; depth: number; nodeCap?: number; dedupTolerance?: number };
export type AlgebraicCorrespondenceWorkerRequest = WindingRequest | TreeRequest | SurvivalRequest;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<AlgebraicCorrespondenceWorkerRequest>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data }) => {
  const progress = (value: number) => scope.postMessage({ type: 'progress', requestId: data.requestId, job: data.type, progress: value });
  try {
    if (data.type === 'winding') {
      const result = renderWindingGrid(data.c, data.view, data.size, progress);
      scope.postMessage({ type: 'result', requestId: data.requestId, job: data.type, result }, [result.windings.buffer, result.ambiguous.buffer]);
      return;
    }
    if (data.type === 'tree') {
      const result = buildCorrespondenceOrbitTree(data);
      scope.postMessage({ type: 'result', requestId: data.requestId, job: data.type, result });
      return;
    }
    const result = renderFiniteBranchSurvivalGrid(data, progress, chunk => {
      scope.postMessage({ type: 'chunk', requestId: data.requestId, job: data.type, chunk }, [chunk.kinds.buffer, chunk.reasons.buffer]);
    });
    scope.postMessage({ type: 'result', requestId: data.requestId, job: data.type, result }, [result.kinds.buffer, result.reasons.buffer]);
  } catch (error) {
    scope.postMessage({ type: 'error', requestId: data.requestId, job: data.type, message: error instanceof Error ? error.message : 'The algebraic correspondence calculation could not finish.' });
  }
};
