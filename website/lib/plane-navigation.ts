import type { PlaneView } from './dynamics';

export type ScreenPoint = { x: number; y: number };
export type ScrollMode = 'pan' | 'zoom';

/** Keep the point under `from` under `to`, including when zoom limits are hit. */
export function transformPlane(view: PlaneView, from: ScreenPoint, to: ScreenPoint, factor = 1, maxSpan = 12): PlaneView {
  if (![from.x, from.y, to.x, to.y, factor].every(Number.isFinite) || factor <= 0) return view;
  const span = Math.max(0.00002, Math.min(maxSpan, view.span * factor));
  return {
    re: view.re + (from.x - 0.5) * view.span - (to.x - 0.5) * span,
    im: view.im + (0.5 - from.y) * view.span - (0.5 - to.y) * span,
    span,
  };
}

export function pinchPlane(view: PlaneView, before: ScreenPoint[], after: ScreenPoint[], maxSpan = 12): PlaneView {
  const midpoint = ([a, b]: ScreenPoint[]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const distance = ([a, b]: ScreenPoint[]) => Math.hypot(a.x - b.x, a.y - b.y);
  const oldDistance = distance(before), newDistance = distance(after);
  if (oldDistance < 0.0001 || newDistance < 0.0001) return view;
  return transformPlane(view, midpoint(before), midpoint(after), oldDistance / newDistance, maxSpan);
}

export function scrollPlane(view: PlaneView, point: ScreenPoint, delta: { x: number; y: number; mode: number }, box: { width: number; height: number }, zoom: boolean, maxSpan = 12): PlaneView {
  const unit = delta.mode === 1 ? 16 : delta.mode === 2 ? box.height : 1;
  const dx = delta.x * unit, dy = delta.y * unit;
  if (zoom) return transformPlane(view, point, point, Math.exp(Math.max(-0.5, Math.min(0.5, dy * 0.006))), maxSpan);
  return transformPlane(view, { x: 0.5, y: 0.5 }, { x: 0.5 - dx / box.width, y: 0.5 - dy / box.height }, 1, maxSpan);
}

/** Move the last completed raster immediately while the new one computes. */
export function rasterTransform(painted: PlaneView, current: PlaneView) {
  return {
    x: 100 * (painted.re - current.re + (current.span - painted.span) / 2) / current.span,
    y: 100 * (current.im - painted.im + (current.span - painted.span) / 2) / current.span,
    scale: painted.span / current.span,
  };
}
