'use client';

import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { planePoint } from '@/lib/dynamics';
import type { Complex, PlaneView } from '@/lib/dynamics';
import { pinchPlane, scrollPlane, transformPlane } from '@/lib/plane-navigation';
import type { ScreenPoint, ScrollMode } from '@/lib/plane-navigation';

export function usePlaneNavigation(frame: RefObject<HTMLDivElement | null>, view: PlaneView, onViewChange: ((view: PlaneView) => void) | undefined, onSelect: ((point: Complex) => void) | undefined, scrollMode: ScrollMode, maxSpan: number, resetView: PlaneView) {
  const viewRef = useRef(view);
  viewRef.current = view;
  const pointers = useRef(new Map<number, ScreenPoint>());
  const gesture = useRef<{ view: PlaneView; points: ScreenPoint[] } | null>(null);
  const tap = useRef<{ id: number; x: number; y: number } | null>(null);
  const commit = (next: PlaneView) => { viewRef.current = next; onViewChange?.(next); };
  const rebase = () => { gesture.current = { view: viewRef.current, points: Array.from(pointers.current.values()).slice(0, 2) }; };
  const position = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };

  useEffect(() => {
    const element = frame.current;
    if (!element || !onViewChange) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      tap.current = null;
      const box = element.getBoundingClientRect();
      const point = { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
      const zoom = event.ctrlKey || event.metaKey || scrollMode === 'zoom';
      const horizontal = !zoom && event.shiftKey && !event.deltaX;
      const delta = { x: horizontal ? event.deltaY : event.deltaX, y: horizontal ? 0 : event.deltaY, mode: event.deltaMode };
      const next = scrollPlane(viewRef.current, point, delta, box, zoom, maxSpan);
      viewRef.current = next;
      onViewChange(next);
      gesture.current = { view: next, points: Array.from(pointers.current.values()).slice(0, 2) };
    };
    // React's delegated wheel listeners can be passive. A local listener keeps
    // a trackpad pinch inside this plot instead of zooming the entire webpage.
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [frame, onViewChange, scrollMode, maxSpan]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (!onViewChange && !onSelect)) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, position(event));
    tap.current = pointers.current.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    rebase();
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, position(event));
    if (tap.current && Math.hypot(event.clientX - tap.current.x, event.clientY - tap.current.y) > 6) tap.current = null;
    const start = gesture.current;
    if (!onViewChange || !start || tap.current) return;
    const current = Array.from(pointers.current.values()).slice(0, 2);
    if (current.length >= 2 && start.points.length >= 2) commit(pinchPlane(start.view, start.points, current, maxSpan));
    else if (current.length === 1 && start.points.length === 1) commit(transformPlane(start.view, start.points[0], current[0], 1, maxSpan));
  };
  const endPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.has(event.pointerId)) return;
    const candidate = tap.current;
    tap.current = null;
    if (!cancelled && candidate?.id === event.pointerId && pointers.current.size === 1 && Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y) <= 6) {
      const point = position(event);
      if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) onSelect?.(planePoint(viewRef.current, point.x, point.y));
    }
    pointers.current.delete(event.pointerId);
    rebase();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onViewChange || event.ctrlKey || event.metaKey) return false;
    const keyboardCommit = (next: PlaneView) => { tap.current = null; commit(next); rebase(); };
    const centre = { x: 0.5, y: 0.5 };
    if (['+', '=', '-', '_'].includes(event.key)) {
      event.preventDefault();
      keyboardCommit(transformPlane(viewRef.current, centre, centre, ['+', '='].includes(event.key) ? 0.7 : 1 / 0.7, maxSpan));
      return true;
    }
    if (event.key === 'Home') { event.preventDefault(); keyboardCommit(resetView); return true; }
    if (event.altKey || !onSelect) {
      const delta: Record<string, ScreenPoint> = { ArrowLeft: { x: 0.1, y: 0 }, ArrowRight: { x: -0.1, y: 0 }, ArrowUp: { x: 0, y: 0.1 }, ArrowDown: { x: 0, y: -0.1 } };
      if (delta[event.key]) {
        event.preventDefault();
        keyboardCommit(transformPlane(viewRef.current, centre, { x: centre.x + delta[event.key].x, y: centre.y + delta[event.key].y }, 1, maxSpan));
        return true;
      }
    }
    return false;
  };
  return { onPointerDown, onPointerMove, onPointerUp: (event: PointerEvent<HTMLDivElement>) => endPointer(event), onPointerCancel: (event: PointerEvent<HTMLDivElement>) => endPointer(event, true), onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => endPointer(event, true), onKeyDown };
}
