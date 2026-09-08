'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Two-dimensional plots provide application-style keyboard interaction. */
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import katex from 'katex';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { usePlaneNavigation } from '@/components/use-plane-navigation';
import { formatComplex, planePosition } from '@/lib/dynamics';
import type { Complex, PlaneView } from '@/lib/dynamics';
import { rasterTransform, transformPlane } from '@/lib/plane-navigation';
import type { ScrollMode } from '@/lib/plane-navigation';
import { classifyCorrespondence, correspondenceR, correspondenceCriticalPoints, CORRESPONDENCE_VIEW, MIN_C, MAX_C } from '@/lib/correspondence';
import type { CorrespondenceGrid } from '@/lib/correspondence';
import { correspondenceColour, describeCorrespondencePoint, CORRESPONDENCE_FORMULA, CORRESPONDENCE_RELATION } from '@/lib/correspondence-display';
import type { CorrespondenceLayer } from '@/lib/correspondence-display';

const formulaHtml = katex.renderToString(CORRESPONDENCE_FORMULA, { throwOnError: true, output: 'htmlAndMathml' });
const relationHtml = katex.renderToString(CORRESPONDENCE_RELATION, { throwOnError: true, output: 'htmlAndMathml' });
const PANELS: { layer: CorrespondenceLayer; title: string; description: string }[] = [
  { layer: 'limit', title: 'Limit set', description: 'A numerical trace of the common boundary.' },
  { layer: 'tiling', title: 'Tiling set', description: 'Colour records the first entry into the fundamental tile.' },
  { layer: 'non-escaping', title: 'Non-escaping set', description: 'The detected interior; the limit set also belongs here.' },
];

function FundamentalTile({ c }: { c: number }) {
  const path = useMemo(() => Array.from({ length: 1024 }, (_, i) => {
    const t = 2 * Math.PI * i / 1024;
    const w = correspondenceR({ re: Math.cos(t), im: Math.sin(t) }, c);
    return `${i ? 'L' : 'M'}${(100 + w.re * 50).toFixed(5)},${(100 - w.im * 50).toFixed(5)}`;
  }).join(' ') + ' Z', [c]);
  const contacts = c === MAX_C ? [0] : c === MIN_C ? [-4 * Math.SQRT2 / 5, 4 * Math.SQRT2 / 5] : [];
  return <figure className="correspondence-tile">
    <svg viewBox="10 10 180 180" role="img" aria-label={`Fundamental tile in the w-plane, ${c === MAX_C ? 'two' : c === MIN_C ? 'three' : 'one'} open cells`}>
      <path d="M10 100H190M100 10V190" stroke="#e1ddd4" strokeWidth="0.5" />
      <path d={path} fill="#ece0bf" fillRule="evenodd" stroke="#254859" strokeWidth="0.7" />
      {contacts.map(y => <circle key={y} cx="100" cy={100 - 50 * y} r="1.8" fill="#a95529" />)}
    </svg>
    <figcaption><strong>Fundamental tile · <i>w</i>-plane</strong><span>Boundary: <i>R</i><sub>c</sub>(e<sup>it</sup>)</span><span>{c === MAX_C ? 'Two cells meet at a pinch.' : c === MIN_C ? 'Three cells meet at two pinches.' : 'Move c towards either endpoint to narrow the necks.'}</span><small>The three fractal views below are in the <i>z</i>-plane.</small></figcaption>
  </figure>;
}

function CorrespondencePlane({ layer, title, description, grid, view, onViewChange, selected, onSelect, scrollMode, criticalPoints, pending, failed }: {
  layer: CorrespondenceLayer; title: string; description: string; grid: CorrespondenceGrid | null;
  view: PlaneView; onViewChange: (view: PlaneView) => void; selected: Complex; onSelect: (z: Complex) => void;
  scrollMode: ScrollMode; criticalPoints: Complex[]; pending: boolean; failed: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const [canvasError, setCanvasError] = useState(false);
  const navigation = usePlaneNavigation(frameRef, view, onViewChange, onSelect, scrollMode, 12, CORRESPONDENCE_VIEW);
  useEffect(() => {
    if (!grid) return;
    const canvas = canvasRef.current, context = canvas?.getContext('2d');
    if (!canvas || !context) { setCanvasError(true); return; }
    canvas.width = grid.size; canvas.height = grid.size;
    const pixels = context.createImageData(grid.size, grid.size);
    for (let i = 0; i < grid.kinds.length; i++) {
      const colour = correspondenceColour(grid, i, layer);
      pixels.data[4 * i] = colour[0]; pixels.data[4 * i + 1] = colour[1]; pixels.data[4 * i + 2] = colour[2]; pixels.data[4 * i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    setCanvasError(false);
  }, [grid, layer]);
  const transform = rasterTransform(grid?.view ?? view, view);
  const selection = planePosition(view, selected);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (navigation.onKeyDown(event) || event.ctrlKey || event.metaKey) return;
    const delta: Record<string, Complex> = { ArrowLeft: { re: -1, im: 0 }, ArrowRight: { re: 1, im: 0 }, ArrowUp: { re: 0, im: 1 }, ArrowDown: { re: 0, im: -1 } };
    if (delta[event.key]) {
      event.preventDefault();
      const step = view.span * (event.shiftKey ? 0.05 : 0.01);
      onSelect({ re: selected.re + delta[event.key].re * step, im: selected.im + delta[event.key].im * step });
    }
  };
  return <section className={`correspondence-panel correspondence-${layer}`} aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>{title}</h3>
    <p>{description}</p>
    <div ref={frameRef} className="correspondence-plot" role="application" tabIndex={0} aria-label={`${title}, interactive complex plane`} aria-describedby="correspondence-navigation" aria-busy={pending && !failed} {...navigation} onKeyDown={onKeyDown}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ transform: `translate(${transform.x}%, ${transform.y}%) scale(${transform.scale})` }} />
      <svg className="correspondence-overlay" viewBox="0 0 100 100" aria-hidden="true">
        {criticalPoints.map((point, index) => {
          const p = planePosition(view, point);
          return <circle key={index} cx={100 * p.x} cy={100 * p.y} r="0.8" fill="#bd632b" stroke="white" strokeWidth="0.3" />;
        })}
        <g transform={`translate(${100 * selection.x} ${100 * selection.y})`} stroke="#111b24" strokeWidth="0.4" fill="none">
          <circle r="1.25" stroke="white" strokeWidth="0.9" /><circle r="1.25" />
          <path d="M-2.5 0H-1.5M1.5 0H2.5M0-2.5V-1.5M0 1.5V2.5" />
        </g>
      </svg>
      {(!grid || canvasError) && <span className="correspondence-plot-message">{canvasError ? 'This browser could not draw the canvas. The point inspector below is still available.' : failed ? 'Calculation unavailable. See the message below to retry.' : 'Calculating the three sets…'}</span>}
      {grid && pending && <span className="correspondence-update-label">{failed ? 'Previous view' : 'Updating'} · previous c = {grid.c.toFixed(4)}</span>}
      <span className="correspondence-axis-real" aria-hidden="true">Re z →</span><span className="correspondence-axis-imaginary" aria-hidden="true">Im z ↑</span>
    </div>
  </section>;
}

export function VerifiedRoundCorrespondenceExplorer() {
  const [c, setC] = useState(0);
  const [view, setView] = useState<PlaneView>(CORRESPONDENCE_VIEW);
  const [selected, setSelected] = useState<Complex>({ re: 0, im: 0 });
  const [iterations, setIterations] = useState(64);
  const [resolution, setResolution] = useState(0);
  const [autoSize, setAutoSize] = useState(640);
  const plotsRef = useRef<HTMLDivElement>(null);
  const size = resolution || autoSize;
  const [scrollMode, setScrollMode] = useState<ScrollMode>('pan');
  const [showCritical, setShowCritical] = useState(false);
  const [grid, setGrid] = useState<CorrespondenceGrid | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const panel = plotsRef.current?.firstElementChild;
    if (!panel) return;
    const observer = new ResizeObserver(([entry]) => setAutoSize(Math.max(480, Math.min(1536, Math.round(entry.contentRect.width * Math.min(window.devicePixelRatio || 1, 2))))));
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  const pending = !grid || grid.c !== c || grid.size !== size || grid.iterations !== iterations || grid.view.re !== view.re || grid.view.im !== view.im || grid.view.span !== view.span;
  const result = useMemo(() => classifyCorrespondence(selected, c, iterations), [selected, c, iterations]);
  // Keep the marker normalization consistent with the raster while a new c computes.
  const criticalPoints = useMemo(() => showCritical ? correspondenceCriticalPoints(grid?.c ?? c) : [], [showCritical, grid?.c, c]);
  useEffect(() => {
    let worker: Worker | undefined;
    let active = true;
    setProgress(0); setError('');
    const fail = (message: string) => { if (active) setError(message); worker?.terminate(); };
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('../lib/correspondence.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (!active) return;
          if (data.type === 'progress') setProgress(data.progress);
          if (data.type === 'result') { setGrid(data.result); setProgress(1); worker?.terminate(); }
          if (data.type === 'error') fail(data.message);
        };
        worker.onerror = () => fail('The background calculation could not load. Try again, or reload this page.');
        worker.postMessage({ c, view, size, iterations });
      } catch { fail('This browser could not start the calculation. Try a current browser.'); }
    }, 130);
    return () => { active = false; window.clearTimeout(timer); worker?.terminate(); };
  }, [c, view, size, iterations, retry]);
  const zoom = (factor: number) => setView(current => transformPlane(current, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, factor, 12));
  return <section className="dynamics-workbench correspondence-workbench" aria-labelledby="correspondence-title">
    <div className="workbench-heading"><div><h2 id="correspondence-title">A Family of Correspondences</h2><p className="correspondence-intro">A symmetric real slice of the family in Example 4.</p></div><a className="correspondence-paper" href="https://arxiv.org/pdf/2504.13107v2#page=30" target="_blank" rel="noreferrer">Luo–Mj–Mukherjee ↗</a></div>
    <div className="correspondence-formulas"><div dangerouslySetInnerHTML={{ __html: formulaHtml }} /><div dangerouslySetInnerHTML={{ __html: relationHtml }} /></div>
    <div className="correspondence-controls">
      <div className="correspondence-parameter"><label id="correspondence-parameter-label">Real parameter <i>c</i> <output>{c.toFixed(4)}</output></label><Slider value={[c]} min={MIN_C} max={MAX_C} step={0.0001} onValueChange={value => setC(Math.max(MIN_C, Math.min(MAX_C, Array.isArray(value) ? value[0] : value)))} aria-labelledby="correspondence-parameter-label" /><div className="correspondence-range"><span>−3/5</span><button type="button" onClick={() => setC(0)}>Reset c to 0</button><span>3/5</span></div></div>
      <label>Iteration depth<select value={iterations} onChange={event => setIterations(Number(event.target.value))}>{[32, 64, 120, 240].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Resolution<select value={resolution} onChange={event => setResolution(Number(event.target.value))}><option value={0}>Auto · screen density</option><option value={640}>640²</option><option value={1024}>Fine · 1024²</option><option value={1536}>Ultra fine · 1536²</option></select></label>
      <label>Scroll to<select value={scrollMode} onChange={event => setScrollMode(event.target.value as ScrollMode)}><option value="pan">Pan</option><option value="zoom">Zoom</option></select></label>
      <div className="correspondence-zoom"><Button variant="outline" size="sm" aria-label="Zoom into all three sets" onClick={() => zoom(0.65)}><Plus /></Button><Button variant="outline" size="sm" aria-label="Zoom out of all three sets" onClick={() => zoom(1 / 0.65)}><Minus /></Button><Button variant="outline" size="sm" onClick={() => setView(CORRESPONDENCE_VIEW)}><RotateCcw /> Reset view</Button></div>
    </div>
    <div className="correspondence-pinching-controls"><span>Pinching</span><Button variant="outline" size="sm" aria-pressed={c === MIN_C} onClick={() => { setC(MIN_C); setView({ re: 0, im: 0, span: 4.6 }); }}>c = −3/5</Button><Button variant="outline" size="sm" onClick={() => setC(-0.5999)}>Just before −3/5</Button><Button variant="outline" size="sm" onClick={() => setC(0.5999)}>Just before 3/5</Button><Button variant="outline" size="sm" aria-pressed={c === MAX_C} onClick={() => { setC(MAX_C); setView(CORRESPONDENCE_VIEW); }}>c = 3/5</Button>{Math.abs(c) === MAX_C && <span>Pinched limit</span>}</div>
    <FundamentalTile c={c} />
    <p className="correspondence-help" id="correspondence-navigation">All three views move together. Drag to pan; pinch to zoom; click to inspect. Keyboard: arrows move the point, Alt + arrows pan, + / − zoom, Home resets.</p>
    <div ref={plotsRef} className="correspondence-plots">{PANELS.map(panel => <CorrespondencePlane key={panel.layer} {...panel} grid={grid} view={view} onViewChange={setView} selected={selected} onSelect={setSelected} scrollMode={scrollMode} criticalPoints={criticalPoints} pending={pending} failed={Boolean(error)} />)}</div>
    <div className="correspondence-legend"><span><i className="legend-limit" />Approximate boundary</span><span><i className="legend-tiling" />Tiling: shallow → deep</span><span><i className="legend-nonescaping" />Non-escaping interior</span><span><i className="legend-unresolved" />Unresolved</span><label><input type="checkbox" checked={showCritical} onChange={event => setShowCritical(event.target.checked)} />Six cusp critical points</label></div>
    <div className="correspondence-status" role="status" aria-live="polite">{error ? <><span>{error}</span><Button variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>Try again</Button></> : pending ? `Updating all three views · ${Math.round(progress * 100)}%` : grid ? `${grid.size} × ${grid.size} sample points · ${grid.counts.unresolved.toLocaleString()} unresolved · view width ${view.span.toPrecision(4)}` : ''}</div>
    <div className="correspondence-inspector"><div><span>Selected point</span><strong>z = {formatComplex(selected)}</strong><span>c = {c.toFixed(4)}</span></div><p>{describeCorrespondencePoint(result)}</p><Button variant="outline" size="sm" onClick={() => setView(current => ({ ...current, re: selected.re, im: selected.im, span: Math.max(0.00002, current.span * 0.45) }))}>Zoom to point</Button></div>
  </section>;
}

const AlgebraicCorrespondenceExplorer = lazy(() => import('@/components/algebraic-correspondence-explorer'));

export function CorrespondenceExplorer() {
  const [mode, setMode] = useState<'verified-round' | 'post-pinching' | 'ramified'>('verified-round');
  return <section className="correspondence-suite" aria-labelledby="correspondence-suite-title">
    <header className="correspondence-suite-heading">
      <div><span className="kicker">Three mathematical regimes</span><h2 id="correspondence-suite-title">A Family of Correspondences</h2></div>
      <div className="correspondence-mode-selector" role="group" aria-label="Correspondence model">
        <Button variant="outline" aria-pressed={mode === 'verified-round'} onClick={() => setMode('verified-round')}>Verified round model</Button>
        <Button variant="outline" aria-pressed={mode === 'post-pinching'} onClick={() => setMode('post-pinching')}>Post-pinching branches</Button>
        <Button variant="outline" aria-pressed={mode === 'ramified'} onClick={() => setMode('ramified')}>Ramified exploration</Button>
      </div>
    </header>
    {mode === 'verified-round'
      ? <><div className="algebraic-regime"><strong>Verified round model</strong><span>The established univalent model for −3/5 ≤ c ≤ 3/5.</span></div><VerifiedRoundCorrespondenceExplorer /></>
      : <Suspense fallback={<p className="article-loading">Opening the all-branch experiment…</p>}><AlgebraicCorrespondenceExplorer mode={mode} /></Suspense>}
  </section>;
}
