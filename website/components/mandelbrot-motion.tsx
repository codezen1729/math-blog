'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The two-dimensional multiplier picker is a keyboard-controlled application region. */
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- role=application intentionally captures arrow keys for a two-dimensional selector; the radius also has a conventional labelled slider. */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { FractalPlane } from '@/components/dynamics-explorer';
import { formatComplex, MAX_MOTION_RADIUS, openDiskMultiplier, PARAMETER_VIEW, sliceEscape, zoomView } from '@/lib/dynamics';
import type { Complex } from '@/lib/dynamics';
import { multiplierFormulaHtml } from '@/lib/laboratory-labels';

const ZERO = { re: 0, im: 0 };

export function MandelbrotMotion() {
  const [mu, setMu] = useState<Complex>(ZERO);
  const [view, setView] = useState(PARAMETER_VIEW);
  const [iterations, setIterations] = useState(180);
  const [playing, setPlaying] = useState(false);
  const [rendered, setRendered] = useState(0);
  const id = useId();
  const diskRef = useRef<HTMLDivElement>(null);
  const radius = Math.hypot(mu.re, mu.im);
  const angle = Math.atan2(mu.im, mu.re);
  const choose = (point: Complex) => {
    setMu(openDiskMultiplier(point));
    setPlaying(false);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointermove' && event.buttons !== 1) return;
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    choose({ re: 2.3 * ((event.clientX - box.left) / box.width - 0.5), im: 2.3 * (0.5 - (event.clientY - box.top) / box.height) });
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.005 : 0.025;
    const movements: Record<string, Complex> = { ArrowRight: { re: step, im: 0 }, ArrowLeft: { re: -step, im: 0 }, ArrowUp: { re: 0, im: step }, ArrowDown: { re: 0, im: -step } };
    if (movements[event.key]) { event.preventDefault(); choose({ re: mu.re + movements[event.key].re, im: mu.im + movements[event.key].im }); }
  };
  const escape = useCallback((re: number, im: number, limit: number) => sliceEscape({ re, im }, mu, limit), [mu]);
  const onRendered = useCallback(() => setRendered((n) => n + 1), []);
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setMu((previous) => {
        const r = Math.hypot(previous.re, previous.im) || 0.5;
        const theta = Math.atan2(previous.im, previous.re) + Math.PI / 24;
        return openDiskMultiplier({ re: r * Math.cos(theta), im: r * Math.sin(theta) });
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [playing, rendered]);
  return <section className="dynamics-workbench motion-workbench" aria-labelledby={`${id}-title`}>
    <header className="workbench-heading"><h2 id={`${id}-title`}>Moving the External Maps</h2><span className="workbench-equation" dangerouslySetInnerHTML={{ __html: multiplierFormulaHtml }} /></header>
    <p className="workbench-instructions">Move the multiplier μ inside the disk to explore the connectedness locus in Per₁(μ).</p>
    <div className="motion-layout">
      <div className="multiplier-controls">
        <h3>The unit disk</h3>
        <div className="multiplier-disk" ref={diskRef} role="application" tabIndex={0} onPointerDown={move} onPointerMove={move} onKeyDown={key} aria-label="Choose the fixed-point multiplier in the open unit disk. Click, drag, or use arrow keys. The boundary is excluded.">
          <svg viewBox="-1.15 -1.15 2.3 2.3" aria-hidden="true"><circle className="unit-disk-boundary" r="1" /><path className="disk-axes" d="M-1.06 0H1.06M0 -1.06V1.06" /><circle className="disk-radius" r={radius} /><line className="disk-ray" x1="0" y1="0" x2={mu.re} y2={-mu.im} /><circle className="disk-point" cx={mu.re} cy={-mu.im} r=".04" /></svg>
          <span className="disk-label disk-one">1</span><span className="disk-label disk-i">i</span><span className="disk-label disk-zero">0</span>
        </div>
        <output className="multiplier-value" aria-live="polite">μ = {formatComplex(mu, radius > .99 ? 12 : 4)}</output>
        <div className="motion-radius-label"><span id={`${id}-radius-label`}>Radius |μ| <b>{radius > .99 ? radius.toPrecision(16) : radius.toFixed(4)}</b></span><Slider aria-labelledby={`${id}-radius-label`} min={0} max={MAX_MOTION_RADIUS} step={0.001} value={[radius]} onValueChange={(value) => { const r = Array.isArray(value) ? value[0] : value; choose({ re: r * Math.cos(angle), im: r * Math.sin(angle) }); }} /></div>
        <form className="motion-precise-radius" key={`${radius}`} onSubmit={event => { event.preventDefault(); const r = Number(new FormData(event.currentTarget).get('radius')); if (Number.isFinite(r) && r >= 0 && r < 1) choose({ re: r * Math.cos(angle), im: r * Math.sin(angle) }); }}><label htmlFor={`${id}-precise`}>Exact radius</label><Input id={`${id}-precise`} name="radius" type="number" min={0} max={MAX_MOTION_RADIUS} step="any" defaultValue={radius} required /><Button type="submit" size="sm" variant="outline">Set</Button></form>
        <div className="motion-near-boundary">{[.9,.99,.999,.9999].map(r => <Button key={r} size="sm" variant="outline" onClick={() => choose({ re: r * Math.cos(angle), im: r * Math.sin(angle) })}>{r}</Button>)}</div>
        <div className="motion-buttons"><Button variant="outline" size="sm" onClick={() => setPlaying(!playing)}>{playing ? <Pause /> : <Play />}{playing ? 'Pause' : 'Travel around the disk'}</Button><Button variant="outline" size="sm" onClick={() => choose(ZERO)}><RotateCcw /> μ = 0</Button></div>
        <p className="motion-note">The boundary |μ| = 1 is excluded. Convergence slows near it.{radius > .99 && <> Distance to the circle: {(1 - radius).toExponential(2)}.</>}</p>
      </div>
      <section className="plane-panel motion-plane"><header><div><h3>{radius < 1e-10 ? 'M₀ = Mandelbrot set' : 'Connectedness locus Mμ'}</h3><span>Slice Per₁(μ) · coordinate q</span></div><div className="plot-zoom"><Button variant="outline" size="icon-sm" aria-label="Zoom in connectedness locus" onClick={() => setView(zoomView(view, view, 0.5, 120))}><Plus /></Button><Button variant="outline" size="icon-sm" aria-label="Zoom out connectedness locus" onClick={() => setView(zoomView(view, view, 2, 120))}><Minus /></Button><Button variant="outline" size="icon-sm" aria-label="Reset connectedness locus view" onClick={() => setView(PARAMETER_VIEW)}><RotateCcw /></Button></div></header>
        <FractalPlane mode="motion" c={ZERO} view={view} iterations={iterations} renderEscape={escape} onRendered={onRendered} onViewChange={setView} maxSpan={120} />
        <p className="navigation-hint">Drag or scroll to pan · Pinch or Ctrl + scroll to zoom</p>
        <label className="detail-control">Detail <select aria-label="Connectedness locus iteration limit" value={iterations} onChange={(event) => setIterations(Number(event.target.value))}><option value={100}>100 iterations</option><option value={180}>180 iterations</option><option value={350}>350 iterations</option><option value={700}>700 iterations</option><option value={1500}>1500 iterations</option><option value={4000}>4000 iterations</option></select><span>Dark: unresolved at this depth</span></label>
      </section>
    </div>
  </section>;
}
