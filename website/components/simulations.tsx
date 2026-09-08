'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Canvas and SVG are the visualizations themselves and include accessible labels. */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type JuliaPreset = {
  label: string;
  real: number;
  imaginary: number;
};

const juliaPresets: JuliaPreset[] = [
  { label: 'Douady rabbit', real: -0.123, imaginary: 0.745 },
  { label: 'Basilica', real: -1, imaginary: 0 },
  { label: 'Dendrite', real: 0, imaginary: 1 },
];

function cssColor(element: Element, name: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback;
}

export function JuliaExplorer({ compact = false }: { compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [real, setReal] = useState(-0.123);
  const [imaginary, setImaginary] = useState(0.745);
  const [iterations, setIterations] = useState(compact ? 58 : 82);
  const [width, setWidth] = useState(640);
  const deferredReal = useDeferredValue(real);
  const deferredImaginary = useDeferredValue(imaginary);
  const deferredIterations = useDeferredValue(iterations);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cssWidth = Math.min(width, compact ? 520 : 760);
    const cssHeight = Math.round(cssWidth * (compact ? 0.58 : 0.6));
    const pixelRatio = 1;
    const renderWidth = Math.floor(cssWidth * pixelRatio);
    const renderHeight = Math.floor(cssHeight * pixelRatio);
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.style.height = `${cssHeight}px`;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = context.createImageData(renderWidth, renderHeight);
    const ink = cssColor(canvas, '--sim-ink-rgb', '16, 42, 55').split(',').map(Number);
    const paper = cssColor(canvas, '--sim-paper-rgb', '245, 241, 229').split(',').map(Number);
    const accent = cssColor(canvas, '--sim-accent-rgb', '183, 82, 53').split(',').map(Number);
    const aspect = renderWidth / renderHeight;
    const ySpan = 3.15;
    const xSpan = ySpan * aspect;
    const xMin = -xSpan / 2;
    const yMin = -ySpan / 2;

    for (let py = 0; py < renderHeight; py += 1) {
      const zy0 = yMin + (py / renderHeight) * ySpan;
      for (let px = 0; px < renderWidth; px += 1) {
        let zx = xMin + (px / renderWidth) * xSpan;
        let zy = zy0;
        let step = 0;
        let zx2 = zx * zx;
        let zy2 = zy * zy;
        while (zx2 + zy2 <= 4 && step < deferredIterations) {
          zy = 2 * zx * zy + deferredImaginary;
          zx = zx2 - zy2 + deferredReal;
          zx2 = zx * zx;
          zy2 = zy * zy;
          step += 1;
        }
        const offset = (py * renderWidth + px) * 4;
        if (step === deferredIterations) {
          image.data[offset] = ink[0];
          image.data[offset + 1] = ink[1];
          image.data[offset + 2] = ink[2];
        } else {
          const smooth = step + 1 - Math.log2(Math.log2(Math.max(4, zx2 + zy2)));
          const t = Math.max(0, Math.min(1, smooth / deferredIterations));
          const wave = 0.5 + 0.5 * Math.cos(t * Math.PI * 7);
          const mix = 0.18 + 0.66 * Math.pow(t, 0.58);
          image.data[offset] = Math.round(paper[0] * (1 - mix) + (accent[0] * wave + ink[0] * (1 - wave)) * mix);
          image.data[offset + 1] = Math.round(paper[1] * (1 - mix) + (accent[1] * wave + ink[1] * (1 - wave)) * mix);
          image.data[offset + 2] = Math.round(paper[2] * (1 - mix) + (accent[2] * wave + ink[2] * (1 - wave)) * mix);
        }
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [deferredReal, deferredImaginary, deferredIterations, width, compact]);

  const choosePreset = (preset: JuliaPreset) => {
    setReal(preset.real);
    setImaginary(preset.imaginary);
  };

  return (
    <section className={`simulation ${compact ? 'simulation-compact' : ''}`} aria-labelledby={compact ? 'julia-mini-title' : 'julia-title'}>
      <div className="simulation-heading">
        <div>
          <p className="kicker">Interactive field note</p>
          <h2 id={compact ? 'julia-mini-title' : 'julia-title'}>Julia set explorer</h2>
        </div>
        <output className="simulation-value" aria-live="polite">
          c = {real.toFixed(3)} {imaginary < 0 ? '−' : '+'} {Math.abs(imaginary).toFixed(3)}i
        </output>
      </div>
      <div className="julia-frame" ref={frameRef}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Computed Julia set for c equals ${real.toFixed(3)} ${imaginary < 0 ? 'minus' : 'plus'} ${Math.abs(imaginary).toFixed(3)} i`}
        >
          A computed Julia set for the quadratic map z squared plus c.
        </canvas>
      </div>
      {!compact && (
        <div className="simulation-controls">
          <label>
            <span>Real part <b>{real.toFixed(3)}</b></span>
            <input type="range" min="-1.45" max="0.45" step="0.001" value={real} onChange={(event) => setReal(Number(event.target.value))} />
          </label>
          <label>
            <span>Imaginary part <b>{imaginary.toFixed(3)}</b></span>
            <input type="range" min="-1.1" max="1.1" step="0.001" value={imaginary} onChange={(event) => setImaginary(Number(event.target.value))} />
          </label>
          <label>
            <span>Iterations <b>{iterations}</b></span>
            <input type="range" min="35" max="125" step="1" value={iterations} onChange={(event) => setIterations(Number(event.target.value))} />
          </label>
        </div>
      )}
      <div className="preset-row" aria-label="Julia set presets">
        {juliaPresets.map((preset) => (
          <Button key={preset.label} variant="outline" size="sm" onClick={() => choosePreset(preset)}>
            {preset.label}
          </Button>
        ))}
      </div>
      <p className="simulation-caption">
        Each pixel follows the orbit of <span className="math-fallback">z ↦ z² + c</span>. Dark points have not escaped after the selected number of iterations.
      </p>
    </section>
  );
}

export function LatticeExplorer() {
  const [tauReal, setTauReal] = useState(0.28);
  const [tauImaginary, setTauImaginary] = useState(1.08);
  const points = useMemo(() => {
    const result: Array<{ x: number; y: number; key: string }> = [];
    for (let m = -6; m <= 6; m += 1) {
      for (let n = -4; n <= 4; n += 1) {
        result.push({
          x: 300 + 54 * (m + n * tauReal),
          y: 190 - 54 * n * tauImaginary,
          key: `${m}:${n}`,
        });
      }
    }
    return result;
  }, [tauReal, tauImaginary]);
  const tauX = 300 + 54 * tauReal;
  const tauY = 190 - 54 * tauImaginary;

  return (
    <section className="simulation" aria-labelledby="lattice-title">
      <div className="simulation-heading">
        <div>
          <p className="kicker">Interactive field note</p>
          <h2 id="lattice-title">A lattice becomes a torus</h2>
        </div>
        <output className="simulation-value" aria-live="polite">
          τ = {tauReal.toFixed(2)} + {tauImaginary.toFixed(2)}i
        </output>
      </div>
      <div className="lattice-frame">
        <svg viewBox="0 0 600 380" role="img" aria-labelledby="lattice-svg-title lattice-svg-desc">
          <title id="lattice-svg-title">Complex lattice generated by one and tau</title>
          <desc id="lattice-svg-desc">A grid of lattice points with one fundamental parallelogram highlighted. Adjusting tau changes its shape.</desc>
          <defs>
            <pattern id="paper-grid" width="27" height="27" patternUnits="userSpaceOnUse">
              <path d="M 27 0 L 0 0 0 27" className="lattice-grid" />
            </pattern>
          </defs>
          <rect width="600" height="380" fill="url(#paper-grid)" />
          <line x1="20" y1="190" x2="580" y2="190" className="lattice-axis" />
          <line x1="300" y1="20" x2="300" y2="360" className="lattice-axis" />
          <polygon
            points={`300,190 354,190 ${tauX + 54},${tauY} ${tauX},${tauY}`}
            className="fundamental-domain"
          />
          <line x1="300" y1="190" x2="354" y2="190" className="vector-one" />
          <line x1="300" y1="190" x2={tauX} y2={tauY} className="vector-tau" />
          {points.map((point) => (
            <circle key={point.key} cx={point.x} cy={point.y} r="3.2" className="lattice-point" />
          ))}
          <text x="360" y="181" className="lattice-label">1</text>
          <text x={tauX - 4} y={tauY - 12} className="lattice-label">τ</text>
          <text x={tauX + 27} y={tauY + 34} className="domain-label">fundamental domain</text>
        </svg>
      </div>
      <div className="simulation-controls two-controls">
        <label>
          <span>Shear, Re(τ) <b>{tauReal.toFixed(2)}</b></span>
          <input type="range" min="-0.5" max="0.5" step="0.01" value={tauReal} onChange={(event) => setTauReal(Number(event.target.value))} />
        </label>
        <label>
          <span>Height, Im(τ) <b>{tauImaginary.toFixed(2)}</b></span>
          <input type="range" min="0.55" max="1.65" step="0.01" value={tauImaginary} onChange={(event) => setTauImaginary(Number(event.target.value))} />
        </label>
      </div>
      <div className="preset-row">
        <Button variant="outline" size="sm" onClick={() => { setTauReal(0); setTauImaginary(1); }}>
          Square lattice
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setTauReal(0.5); setTauImaginary(Math.sqrt(3) / 2); }}>
          Hexagonal lattice
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setTauReal(0.28); setTauImaginary(1.08); }}>
          <RotateCcw aria-hidden="true" /> Reset
        </Button>
      </div>
      <p className="simulation-caption">
        Identify opposite edges of the highlighted parallelogram. The quotient ℂ/(ℤ + τℤ) is a complex torus—and, analytically, an elliptic curve.
      </p>
    </section>
  );
}
