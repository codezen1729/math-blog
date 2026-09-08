'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- The canvas has a conventional labelled range input for keyboard access. */

import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DOUBLING_CENTRES, FEIGENBAUM, LANDMARKS, RABBIT_ROOT, realOrbitTail } from '@/lib/mandelbrot-landmarks';
import type { GuideId, LandmarkVisit } from '@/lib/mandelbrot-landmarks';
import type { Complex } from '@/lib/dynamics';
import { feigenbaumParameterHtml, misiurewiczItineraryHtml, rabbitMultiplierHtml } from '@/lib/laboratory-labels';

function BifurcationDiagram({ c, onChange }: { c: number; onChange: (c: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [error, setError] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.min(1400, Math.round(entry.contentRect.width * Math.min(window.devicePixelRatio || 1, 2))))));
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) { setError(true); return; }
    const height = 360;
    context.fillStyle = '#fafbf9';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#235677';
    for (let column = 0; column < width; column++) {
      // Column midpoints avoid the exceptional endpoint c=-2.
      const parameter = -2 + 2.25 * (column + 0.5) / width;
      for (const x of realOrbitTail(parameter)) context.fillRect(column, height * (2.1 - x) / 4.2, 1, 1);
    }
  }, [width]);
  const choose = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.type === 'pointermove' && event.buttons !== 1) return;
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
    const box = event.currentTarget.getBoundingClientRect();
    onChange(Math.max(-2, Math.min(0.25, -2 + 2.25 * (event.clientX - box.left) / box.width)));
  };
  return <div className="bifurcation-explorer">
    <div className="bifurcation-plot" ref={frame}>
      <canvas ref={canvas} width={width} height={360} onPointerDown={choose} onPointerMove={choose} role="img" aria-label="Real quadratic bifurcation diagram. Use the parameter slider below to explore it." />
      <i className="bifurcation-selection" style={{ left: `${100 * (c + 2) / 2.25}%` }} aria-hidden="true" />
      <div className="bifurcation-y-axis" aria-hidden="true"><b>xₙ</b><span style={{ top: '2.38%' }}>2</span><span style={{ top: '50%' }}>0</span><span style={{ top: '97.62%' }}>−2</span></div>
      {error && <span className="bifurcation-error">The diagram is unavailable; the parameter slider still works.</span>}
    </div>
    <div className="bifurcation-axis" aria-hidden="true"><span>c = −2</span><span>−1</span><span>0.25</span></div>
    <label className="bifurcation-slider" htmlFor={id}><span>Real parameter <output>c = {c.toFixed(6)}</output></span><input id={id} aria-label="Bifurcation real parameter" type="range" min={-2} max={0.25} step={0.0001} value={c} onChange={(event) => onChange(Number(event.target.value))} /></label>
    <p className="field-guide-note">Each column shows 100 iterates of x ↦ x² + c, starting at 0, after discarding 450. This is a sampled orbit diagram, not the real Julia set.{c === -2 && ' At c = −2 the critical orbit is exceptional: 0 → −2 → 2 → 2 → … .'}</p>
  </div>;
}

export function MandelbrotFieldGuide({ active, c, onVisit, onClose, onShowPlanes }: { active: GuideId | null; c: Complex; onVisit: (visit: LandmarkVisit) => void; onClose: () => void; onShowPlanes: () => void }) {
  const id = useId();
  const current = LANDMARKS.find((item) => item.id === active);
  const realVisit = (parameter: number, guide: GuideId) => onVisit({ guide, c: { re: parameter, im: 0 }, view: { re: -0.875, im: 0, span: 2.65 }, detail: 700, juliaSpan: 4.4 });
  return <section className="mandelbrot-field-guide" aria-label="Mandelbrot landmarks">
    <div className="landmark-options">{LANDMARKS.map((item) => <Button key={item.id} size="sm" variant="outline" aria-pressed={active === item.id} aria-controls={`${id}-content`} onClick={() => onVisit(item.visit)}>{item.label}</Button>)}</div>
    {!current && <p className="field-guide-note">Choose a landmark to visit it in the two planes above.</p>}
    <div id={`${id}-content`}>
      {current && <div className="field-guide-content">
        <div className="field-guide-title"><h4>{current.label}</h4><div><Button variant="ghost" size="sm" onClick={onShowPlanes}>Show the planes ↑</Button><Button variant="ghost" size="sm" onClick={onClose}>Close guide</Button></div></div>
        {active === 'satellite' && <>
          <p>The rabbit’s period-3 component is a satellite attached to the main cardioid. Its associated small Mandelbrot copy is distorted—not an exact scaled duplicate. At the center, the critical orbit returns to 0 every three steps.</p>
          <div className="field-guide-actions"><Button variant="outline" size="sm" onClick={() => onVisit(current.visit)}>Visit the rabbit center</Button><Button variant="outline" size="sm" onClick={() => onVisit({ ...current.visit, c: RABBIT_ROOT, detail: 700 })}>Visit its attachment point</Button></div>
          <p className="field-guide-note">At the attachment c = −1/8 + (3√3/8)i, the fixed-point multiplier is <span dangerouslySetInnerHTML={{ __html: rabbitMultiplierHtml }} />. The period-3 cycle meets that fixed point. Decimal parameters and the raster are numerical approximations.</p>
        </>}
        {active === 'misiurewicz' && <>
          <p>At c = i, the critical point is strictly preperiodic: it eventually lands on a repelling cycle, but never returns to 0.</p>
          <p className="critical-itinerary" dangerouslySetInnerHTML={{ __html: misiurewiczItineraryHtml }} />
          <p className="field-guide-note">The eventual cycle has period 2 and multiplier 4(1 + i), whose modulus is greater than 1. Use “Follow the orbit” below to step through it.</p>
        </>}
        {active === 'feigenbaum' && <>
          <p>As real c decreases, attracting cycles double: 1, 2, 4, 8, 16, … . This cascade accumulates at <span dangerouslySetInnerHTML={{ __html: feigenbaumParameterHtml }} />. The limit is not a finite-period attracting cycle.</p>
          <div className="field-guide-actions">{DOUBLING_CENTRES.map((item) => <Button key={item.period} size="sm" variant="outline" onClick={() => realVisit(item.c, 'feigenbaum')}>Period {item.period}</Button>)}<Button size="sm" variant="outline" onClick={() => onVisit(current.visit)}>The limit</Button></div>
          <p className="field-guide-note">The buttons visit superattracting centers along the cascade. The Feigenbaum parameter is rounded; finite computation cannot display the infinite limiting process.</p>
        </>}
        {active === 'bifurcations' && <>
          <p>Click the diagram or move the slider to change c in both planes. Read from right to left: a fixed point splits into cycles, then chaotic bands appear, interrupted by periodic windows.</p>
          <BifurcationDiagram c={c.re} onChange={(parameter) => realVisit(parameter, 'bifurcations')} />
          <div className="field-guide-actions"><Button size="sm" variant="outline" onClick={() => realVisit(-0.75, 'bifurcations')}>First period doubling</Button><Button size="sm" variant="outline" onClick={() => realVisit(FEIGENBAUM, 'bifurcations')}>Feigenbaum limit</Button><Button size="sm" variant="outline" onClick={() => realVisit(-1.7548776662466928, 'bifurcations')}>Period-3 window</Button></div>
        </>}
      </div>}
    </div>
  </section>;
}
