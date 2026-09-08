import { renderCorrespondenceGrid } from './correspondence';
import type { PlaneView } from './dynamics';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ c: number; view: PlaneView; size: number; iterations: number }>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = renderCorrespondenceGrid(data.c, data.view, data.size, data.iterations, (progress) => scope.postMessage({ type: 'progress', progress }));
    scope.postMessage({ type: 'result', result }, [result.kinds.buffer, result.depths.buffer, result.boundary.buffer]);
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The calculation could not finish.' });
  }
};
