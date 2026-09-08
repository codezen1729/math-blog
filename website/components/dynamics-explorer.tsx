'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The two-dimensional interactive plots expose keyboard controls as application regions. */
/* oxlint-disable jsx-a11y/no-static-element-interactions -- The dynamic role is application for the keyboard-interactive plot and img for the read-only slice. */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Crosshair, Minus, Pause, Play, Plus, RotateCcw, StepForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { formatComplex, fractalColour, JULIA_VIEW, PARAMETER_VIEW, planePosition, quadraticEscape, quadraticOrbit, zoomView } from '@/lib/dynamics';
import type { Complex, PlaneView } from '@/lib/dynamics';
import { indexedZHtml, quadraticFormulaHtml } from '@/lib/laboratory-labels';
import { DEFAULT_JULIA_PRESET, JULIA_PRESETS, matchingJuliaPreset } from '@/lib/julia-presets';
import { rasterTransform } from '@/lib/plane-navigation';
import type { ScrollMode } from '@/lib/plane-navigation';
import { usePlaneNavigation } from '@/components/use-plane-navigation';
import { MandelbrotFieldGuide } from '@/components/mandelbrot-field-guide';
import type { GuideId, LandmarkVisit } from '@/lib/mandelbrot-landmarks';

const ORIGIN = { re: 0, im: 0 };

function IndexedZ({ index }: { index: number | 'n' }) {
  const html = useMemo(() => indexedZHtml(index), [index]);
  return <span className="indexed-z" dangerouslySetInnerHTML={{ __html: html }} />;
}

function CoordinateForm({ label, accessibleLabel, value, onChange }: { label: ReactNode; accessibleLabel: string; value: Complex; onChange: (point: Complex) => void }) {
  return <form className="coordinate-form" key={`${value.re},${value.im}`} onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const re = Number(form.get('real'));
    const im = Number(form.get('imaginary'));
    if (Number.isFinite(re) && Number.isFinite(im)) onChange({ re, im });
  }}>
    <span className="coordinate-label">{label}</span>
    <Input name="real" type="number" step="any" required defaultValue={value.re.toString()} aria-label={`${accessibleLabel} real part`} />
    <span>+</span>
    <Input name="imaginary" type="number" step="any" required defaultValue={value.im.toString()} aria-label={`${accessibleLabel} imaginary part`} />
    <span>i</span>
    <Button variant="outline" size="sm" type="submit">Set</Button>
  </form>;
}

function PlotMarker({ view, point, label, kind }: { view: PlaneView; point: Complex; label: ReactNode; kind: string }) {
  const { x, y } = planePosition(view, point);
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return <span className={`plot-marker marker-${kind}`} style={{ left: `${100 * x}%`, top: `${100 * y}%` }}><i /><b>{label}</b></span>;
}

export function FractalPlane({ mode, c, view, iterations, selected, onSelect, orbit = [], activeStep = 0, renderEscape, onRendered, onViewChange, scrollMode = 'pan', maxSpan = 12 }: {
  mode: 'parameter' | 'julia' | 'motion'; c: Complex; view: PlaneView; iterations: number;
  selected?: Complex; onSelect?: (point: Complex) => void; orbit?: Complex[]; activeStep?: number;
  renderEscape?: (re: number, im: number, limit: number) => number;
  onRendered?: () => void;
  onViewChange?: (view: PlaneView) => void; scrollMode?: ScrollMode; maxSpan?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [paintedView, setPaintedView] = useState(view);
  const navigation = usePlaneNavigation(frameRef, view, onViewChange, onSelect, scrollMode, maxSpan, mode === 'julia' ? JULIA_VIEW : PARAMETER_VIEW);
  const [width, setWidth] = useState(440);
  const [busy, setBusy] = useState(true);
  const [canvasError, setCanvasError] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!frameRef.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, Math.min(640, Math.round(entry.contentRect.width * Math.min(window.devicePixelRatio || 1, 1.4))))));
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) { setCanvasError(true); return; }
    const pixels = context.createImageData(width, width);
    let pixel = 0;
    let frame = 0;
    setBusy(true);
    const draw = () => {
      const start = performance.now();
      while (pixel < width * width && performance.now() - start < 12) {
        const row = Math.floor(pixel / width);
        const im = view.im + (0.5 - (row + 0.5) / width) * view.span;
        // Yield within a row as well: near-unit multipliers need long orbits.
        const end = Math.min(width * (row + 1), pixel + 16);
        for (; pixel < end; pixel++) {
          const x = pixel % width;
          const re = view.re + ((x + 0.5) / width - 0.5) * view.span;
          const escape = renderEscape ? renderEscape(re, im, iterations) : mode === 'parameter'
            ? quadraticEscape(0, 0, re, im, iterations)
            : quadraticEscape(re, im, c.re, c.im, iterations);
          const colour = fractalColour(escape);
          const offset = 4 * pixel;
          pixels.data[offset] = colour[0];
          pixels.data[offset + 1] = colour[1];
          pixels.data[offset + 2] = colour[2];
          pixels.data[offset + 3] = 255;
        }
      }
      if (pixel < width * width) frame = requestAnimationFrame(draw);
      else {
        if (canvas.width !== width) { canvas.width = width; canvas.height = width; }
        context.putImageData(pixels, 0, 0);
        setPaintedView(view);
        setBusy(false); onRendered?.();
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [width, mode, c.re, c.im, view.re, view.im, view.span, iterations, renderEscape, onRendered]);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return;
    if (navigation.onKeyDown(event)) return;
    if (!onSelect || !selected) return;
    const step = view.span / (event.shiftKey ? 500 : 100);
    const delta: Record<string, Complex> = { ArrowLeft: { re: -step, im: 0 }, ArrowRight: { re: step, im: 0 }, ArrowUp: { re: 0, im: step }, ArrowDown: { re: 0, im: -step } };
    if (delta[event.key]) { event.preventDefault(); onSelect({ re: selected.re + delta[event.key].re, im: selected.im + delta[event.key].im }); }
  };
  const displayed = orbit.slice(0, activeStep + 1).map((z) => planePosition(view, z));
  const originPosition = planePosition(view, ORIGIN);
  const raster = rasterTransform(paintedView, view);
  const interactive = Boolean(onSelect || onViewChange);
  return <>
    <div className={`fractal-plot plot-${mode}${onViewChange ? ' plot-navigable' : ''}`} ref={frameRef} {...navigation} onKeyDown={move} tabIndex={interactive ? 0 : undefined} role={interactive ? "application" : "img"}
      aria-label={`${mode === 'parameter' ? 'Mandelbrot parameter plane. Choose c' : mode === 'julia' ? 'Julia dynamical plane. Choose the initial point z zero' : 'Connectedness locus'}. ${onSelect ? 'Click or use arrow keys; Shift gives finer selection steps.' : ''} ${onViewChange ? 'Drag to pan, pinch to zoom. Plus and minus zoom, Alt and arrow keys pan, Home resets the view.' : ''}`} aria-describedby={id} aria-busy={busy}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ transform: `translate(${raster.x}%, ${raster.y}%) scale(${raster.scale})`, transformOrigin: '0 0' }} />
      <div className="plot-axes" aria-hidden="true">
        {originPosition.x >= 0 && originPosition.x <= 1 && <i className="axis-imaginary" style={{ left: `${originPosition.x * 100}%` }} />}
        {originPosition.y >= 0 && originPosition.y <= 1 && <i className="axis-real" style={{ top: `${originPosition.y * 100}%` }} />}
        <span className="axis-label-real">Re</span><span className="axis-label-imaginary">Im</span>
      </div>
      {mode === 'parameter' && selected && <PlotMarker view={view} point={selected} label="c" kind="parameter" />}
      {mode === 'julia' && <>
        <svg className="orbit-overlay" viewBox="0 0 1000 1000" aria-hidden="true">
          <polyline points={displayed.map(({ x, y }) => `${x * 1000},${y * 1000}`).join(' ')} />
          {displayed.map(({ x, y }, n) => <circle key={n} cx={x * 1000} cy={y * 1000} r={n === displayed.length - 1 ? 7 : 4} />)}
        </svg>
        <PlotMarker view={view} point={ORIGIN} label="0 · critical" kind="critical" />
        <PlotMarker view={view} point={c} label="c" kind="value" />
        {selected && (selected.re !== 0 || selected.im !== 0) && <PlotMarker view={view} point={selected} label={<IndexedZ index={0} />} kind="seed" />}
      </>}
      {canvasError && <p className="plot-error">Canvas is unavailable. Orbit coordinates remain available below.</p>}
      {busy && !canvasError && <span className="plot-rendering">Computing…</span>}
    </div>
    <p className="plot-bounds" id={id}><span>Re [{(view.re - view.span / 2).toFixed(3)}, {(view.re + view.span / 2).toFixed(3)}]</span><span>Im [{(view.im - view.span / 2).toFixed(3)}, {(view.im + view.span / 2).toFixed(3)}]</span></p>
  </>;
}

function ZoomControls({ label, onZoom, onReset }: { label: string; onZoom: (factor: number) => void; onReset: () => void }) {
  return <div className="plot-zoom" aria-label={`${label} view controls`}>
    <Button variant="outline" size="icon-sm" aria-label={`Zoom in ${label} around selected point`} onClick={() => onZoom(0.5)}><Plus /></Button>
    <Button variant="outline" size="icon-sm" aria-label={`Zoom out ${label}`} onClick={() => onZoom(2)}><Minus /></Button>
    <Button variant="outline" size="icon-sm" aria-label={`Reset ${label} view`} onClick={onReset}><RotateCcw /></Button>
  </div>;
}

export function MandelbrotJuliaExplorer() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [c, setC] = useState<Complex>({ re: DEFAULT_JULIA_PRESET.re, im: DEFAULT_JULIA_PRESET.im });
  const [seed, setSeed] = useState<Complex>(ORIGIN);
  const [parameterView, setParameterView] = useState(PARAMETER_VIEW);
  const [juliaView, setJuliaView] = useState(JULIA_VIEW);
  const [iterations, setIterations] = useState(180);
  const [step, setStep] = useState(24);
  const [playing, setPlaying] = useState(false);
  const [scrollMode, setScrollMode] = useState<ScrollMode>('pan');
  const [activeGuide, setActiveGuide] = useState<GuideId | null>(null);
  const activePreset = matchingJuliaPreset(c);
  const id = useId();
  const orbit = useMemo(() => quadraticOrbit(seed, c, 80), [seed, c]);
  const last = orbit.points.length - 1;
  const shown = Math.min(step, last);
  const chooseC = (point: Complex) => { setC(point); setPlaying(false); setActiveGuide(null); };
  const chooseSeed = (point: Complex) => { setSeed(point); setStep(24); setPlaying(false); };
  const visitLandmark = (visit: LandmarkVisit) => {
    chooseC(visit.c); chooseSeed(ORIGIN); setActiveGuide(visit.guide);
    setParameterView(visit.view); setJuliaView({ ...JULIA_VIEW, span: visit.juliaSpan ?? JULIA_VIEW.span }); setIterations(visit.detail);
  };
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setStep((n) => {
      if (n >= last) { setPlaying(false); return last; }
      return n + 1;
    }), 240);
    return () => clearInterval(timer);
  }, [playing, last]);
  return <section className="dynamics-workbench" aria-labelledby={`${id}-title`}>
    <header className="workbench-heading"><h2 ref={headingRef} id={`${id}-title`}>The Quadratic Explorer</h2><span className="workbench-equation" dangerouslySetInnerHTML={{ __html: quadraticFormulaHtml }} /></header>
    <div className="linked-planes">
      <section className="plane-panel" aria-label="Mandelbrot explorer">
        <header><div><h3>Mandelbrot set</h3><span>Parameter plane · click to pin c</span></div><ZoomControls label="Mandelbrot" onZoom={(factor) => setParameterView(zoomView(parameterView, c, factor))} onReset={() => setParameterView(PARAMETER_VIEW)} /></header>
        <FractalPlane mode="parameter" c={ORIGIN} view={parameterView} iterations={iterations} selected={c} onSelect={chooseC} onViewChange={setParameterView} scrollMode={scrollMode} />
        <CoordinateForm label="c" accessibleLabel="c" value={c} onChange={chooseC} />
      </section>
      <section className="plane-panel" aria-label="Julia explorer">
        <header><div><h3>Filled Julia set</h3><span>Dynamical plane · click to choose <IndexedZ index={0} /></span></div><ZoomControls label="Julia" onZoom={(factor) => setJuliaView(zoomView(juliaView, seed, factor))} onReset={() => setJuliaView(JULIA_VIEW)} /></header>
        <FractalPlane mode="julia" c={c} view={juliaView} iterations={iterations} selected={seed} onSelect={chooseSeed} orbit={orbit.points} activeStep={shown} onViewChange={setJuliaView} scrollMode={scrollMode} />
        <CoordinateForm label={<IndexedZ index={0} />} accessibleLabel="z subscript zero" value={seed} onChange={chooseSeed} />
      </section>
    </div>
    <div className="explorer-options">
      <p className="navigation-hint">Drag to pan · Pinch to zoom · Click to select</p>
      <label className="detail-control">Scroll <select aria-label="Scroll navigation" value={scrollMode} onChange={(event) => setScrollMode(event.target.value as ScrollMode)}><option value="pan">Pan the plane</option><option value="zoom">Zoom at pointer</option></select></label>
      <label className="detail-control">Detail <select aria-label="Fractal iteration limit" value={iterations} onChange={(event) => setIterations(Number(event.target.value))}><option value={100}>100 iterations</option><option value={180}>180 iterations</option><option value={350}>350 iterations</option><option value={700}>700 iterations</option></select></label>
    </div>
    <div className="julia-gallery">
      <h3>Classical Julia sets</h3>
      <div className="preset-row" aria-label="Quadratic presets">{JULIA_PRESETS.map((preset) => <Button key={preset.id} size="sm" variant="outline" aria-pressed={activePreset?.id === preset.id} title={`${preset.kind}; c = ${formatComplex(preset, 7)}`} onClick={() => { chooseC({ re: preset.re, im: preset.im }); chooseSeed(ORIGIN); setParameterView(PARAMETER_VIEW); setJuliaView({ ...JULIA_VIEW, span: preset.span ?? JULIA_VIEW.span }); setIterations(preset.detail ?? 180); }}>{preset.name}</Button>)}</div>
      <p className="preset-description" aria-live="polite">{activePreset ? <><strong>{activePreset.name}.</strong> {activePreset.kind}.{activePreset.approximate && ' Parameter rounded to machine precision.'}</> : 'Custom parameter.'}</p>
    </div>
    <MandelbrotFieldGuide active={activeGuide} c={c} onVisit={visitLandmark} onClose={() => setActiveGuide(null)} onShowPlanes={() => headingRef.current?.scrollIntoView({ block: 'start' })} />
    <div className="orbit-console">
      <div className="orbit-title"><h3>Follow the orbit</h3><Button size="sm" variant="outline" onClick={() => chooseSeed(ORIGIN)}><Crosshair /> Start at the critical point</Button></div>
      <div className="orbit-transport">
        <Button variant="outline" size="icon" aria-label={playing ? 'Pause orbit' : 'Play orbit'} onClick={() => { if (playing) setPlaying(false); else { if (shown >= last) setStep(0); setPlaying(true); } }}>{playing ? <Pause /> : <Play />}</Button>
        <Button variant="outline" size="icon" aria-label="Next orbit iterate" disabled={shown >= last} onClick={() => { setPlaying(false); setStep(shown + 1); }}><StepForward /></Button>
        <Button variant="outline" size="icon" aria-label="Restart orbit" onClick={() => { setPlaying(false); setStep(0); }}><RotateCcw /></Button>
        <span id={`${id}-step-label`} className="sr-only">Displayed orbit iterate</span><Slider value={[shown]} min={0} max={Math.max(1, last)} step={1} aria-labelledby={`${id}-step-label`} onValueChange={(value) => { setPlaying(false); setStep(Array.isArray(value) ? value[0] : value); }} />
        <output>n = {shown}</output>
      </div>
      <div className="orbit-readout" aria-live="polite"><strong><IndexedZ index={shown} /> = {formatComplex(orbit.points[shown])}</strong><span>{orbit.escapedAt !== null ? `Orbit escaped at n = ${orbit.escapedAt}.` : 'No escape detected in 80 iterates.'}</span></div>
      <details className="orbit-table"><summary>Orbit coordinates</summary><div><table><thead><tr><th>n</th><th>Re <IndexedZ index="n" /></th><th>Im <IndexedZ index="n" /></th></tr></thead><tbody>{orbit.points.slice(0, shown + 1).map((z, n) => <tr key={n}><td>{n}</td><td>{z.re.toFixed(7)}</td><td>{z.im.toFixed(7)}</td></tr>)}</tbody></table></div></details>
    </div>
  </section>;
}
