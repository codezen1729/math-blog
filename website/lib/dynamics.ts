/** Numerical kernels. Finite escape tests are approximations, not membership proofs. */
export type Complex = { re: number; im: number };
export type PlaneView = Complex & { span: number };

export const PARAMETER_VIEW: PlaneView = { re: -0.65, im: 0, span: 3.5 };
export const JULIA_VIEW: PlaneView = { re: 0, im: 0, span: 3.6 };
// Leave a few rounding ulps between projected polar coordinates and |mu|=1.
export const MAX_MOTION_RADIUS = 1 - 16 * Number.EPSILON;
export function openDiskMultiplier(point: Complex): Complex {
  if (![point.re, point.im].every(Number.isFinite)) return { re: 0, im: 0 };
  const radius = Math.hypot(point.re, point.im);
  const scale = radius > MAX_MOTION_RADIUS ? MAX_MOTION_RADIUS / radius : 1;
  return { re: point.re * scale, im: point.im * scale };
}

export function iterate(z: Complex, c: Complex): Complex {
  return { re: z.re * z.re - z.im * z.im + c.re, im: 2 * z.re * z.im + c.im };
}

export function escapeRadius(c: Complex) {
  return Math.max(2, Math.hypot(c.re, c.im) + 1);
}

export function quadraticOrbit(seed: Complex, c: Complex, limit: number) {
  const points: Complex[] = [seed];
  const radius = escapeRadius(c);
  let z = seed;
  let escapedAt: number | null = Math.hypot(z.re, z.im) > radius ? 0 : null;
  for (let n = 1; n <= limit && escapedAt === null; n++) {
    z = iterate(z, c);
    points.push(z);
    if (!Number.isFinite(z.re + z.im) || Math.hypot(z.re, z.im) > radius) escapedAt = n;
  }
  return { points, escapedAt, radius };
}

export function planePoint(view: PlaneView, x: number, y: number): Complex {
  return { re: view.re + (x - 0.5) * view.span, im: view.im + (0.5 - y) * view.span };
}

export function planePosition(view: PlaneView, point: Complex) {
  return { x: 0.5 + (point.re - view.re) / view.span, y: 0.5 - (point.im - view.im) / view.span };
}

export function zoomView(view: PlaneView, centre: Complex, factor: number, maxSpan = 12): PlaneView {
  return { ...centre, span: Math.max(0.00002, Math.min(maxSpan, view.span * factor)) };
}

export function formatComplex(z: Complex, digits = 4) {
  return `${z.re.toFixed(digits)} ${z.im < 0 ? '−' : '+'} ${Math.abs(z.im).toFixed(digits)}i`;
}

export function quadraticEscape(re: number, im: number, cr: number, ci: number, limit: number) {
  const radius2 = Math.max(4, (Math.hypot(cr, ci) + 1) ** 2);
  let n = 0;
  while (re * re + im * im <= radius2 && n < limit) {
    const next = re * re - im * im + cr;
    im = 2 * re * im + ci;
    re = next;
    n++;
  }
  return re * re + im * im <= radius2 ? -1 : Math.max(0, n + 1 - Math.log2(Math.max(1, Math.log2(Math.max(4, re * re + im * im)))));
}

export function fractalColour(escape: number): [number, number, number] {
  if (escape < 0) return [14, 37, 55];
  const t = Math.log1p(escape) * 1.5;
  return [
    Math.round(160 + 85 * Math.cos(t)),
    Math.round(159 + 78 * Math.cos(t + 0.4)),
    Math.round(154 + 67 * Math.cos(t + 0.85)),
  ];
}

export function multiply(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function divide(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

export function complexSqrt(z: Complex): Complex {
  const modulus = Math.hypot(z.re, z.im);
  if (modulus === 0) return { re: 0, im: 0 };
  // Compute the larger component first; subtracting near-equal magnitudes
  // would erase a small imaginary (or real) part close to an axis.
  if (z.re >= 0) {
    const re = Math.sqrt(modulus / 2 + z.re / 2);
    return { re, im: z.im / (2 * re) };
  }
  const im = (z.im < 0 ? -1 : 1) * Math.sqrt(modulus / 2 - z.re / 2);
  return { re: Math.abs(z.im / (2 * im)), im };
}

/** Milnor normal form z(z+beta)/(1+mu*z), with q = beta*gamma/4.
 * This is a coordinate on a slice, NOT the pointwise holomorphic-motion map.
 * References and numerical details are retained in docs/laboratory.md.
 */
export function sliceNormalForm(q: Complex, mu: Complex) {
  const mq = multiply(mu, q);
  const sum = { re: 2 - mu.re + 4 * mq.re, im: -mu.im + 4 * mq.im };
  const sum2 = multiply(sum, sum);
  const disc = complexSqrt({ re: sum2.re - 16 * q.re, im: sum2.im - 16 * q.im });
  const first = { re: (sum.re + disc.re) / 2, im: (sum.im + disc.im) / 2 };
  const second = { re: (sum.re - disc.re) / 2, im: (sum.im - disc.im) / 2 };
  const larger = Math.hypot(first.re, first.im) >= Math.hypot(second.re, second.im) ? first : second;
  const beta = divide({ re: 4 * q.re, im: 4 * q.im }, larger);
  const mb = multiply(mu, beta);
  const s = complexSqrt({ re: 1 - mb.re, im: -mb.im });
  const critical1 = divide({ re: -beta.re, im: -beta.im }, { re: 1 + s.re, im: s.im });
  const critical2 = mu.re === 0 && mu.im === 0 ? null : divide({ re: -1 - s.re, im: -s.im }, mu);
  const radius = 2 * (Math.hypot(beta.re, beta.im) + 1) / (1 - Math.hypot(mu.re, mu.im));
  return { beta, critical1, critical2, radius };
}

function rationalEscape(z: Complex, beta: Complex, mu: Complex, radius: number, limit: number) {
  let re = z.re;
  let im = z.im;
  const radius2 = radius * radius;
  for (let n = 0; n < limit; n++) {
    if (re * re + im * im > radius2) return n;
    const nr = re * re - im * im + beta.re * re - beta.im * im;
    const ni = 2 * re * im + beta.re * im + beta.im * re;
    const dr = 1 + mu.re * re - mu.im * im;
    const di = mu.re * im + mu.im * re;
    const denominator = dr * dr + di * di;
    if (denominator === 0) return n + 1; // A pole maps to the attracting point infinity.
    re = (nr * dr + ni * di) / denominator;
    im = (ni * dr - nr * di) / denominator;
    if (!Number.isFinite(re + im)) return n + 1;
  }
  return re * re + im * im > radius2 ? limit : -1;
}

export function sliceEscape(q: Complex, mu: Complex, limit: number) {
  if (![q.re, q.im, mu.re, mu.im].every(Number.isFinite) || Math.hypot(mu.re, mu.im) >= 1) return -1;
  if (mu.re === 0 && mu.im === 0) return quadraticEscape(0, 0, q.re, q.im, limit);
  if (Math.hypot(mu.re, mu.im) > 0.85) return mixedSliceEscape(q, mu, limit);
  const { beta, critical1, critical2, radius } = sliceNormalForm(q, mu);
  const first = rationalEscape(critical1, beta, mu, radius, limit);
  if (first < 0) return -1;
  const second = rationalEscape(critical2!, beta, mu, radius, limit);
  return second < 0 ? -1 : Math.max(first, second);
}

/** Milnor's mixed chart: g(z)=(z+1/z+T)/mu, with critical points +/-1.
 * T²=4(1-mu)+mu²(1-4q). This avoids the collapsing beta chart near mu=1.
 * See docs/laboratory.md for normalization and the infinity-basin trap. */
export function mixedSliceNormalForm(q: Complex, mu: Complex) {
  const square = multiply(mu, mu);
  const product = multiply(square, { re: 1 - 4 * q.re, im: -4 * q.im });
  const t = complexSqrt({ re: 4 * (1 - mu.re) + product.re, im: -4 * mu.im + product.im });
  const inverseRadius = (1 - Math.hypot(mu.re, mu.im)) / (2 * (Math.hypot(t.re, t.im) + 1));
  return { t, inverseRadius };
}

function mixedCriticalEscape(sign: number, t: Complex, mu: Complex, inverseRadius: number, limit: number) {
  // Homogeneous coordinates avoid huge affine values near a pole:
  // [Z:W] -> [Z²+TZW+W² : mu*ZW]. Both zero is a failure, never escape.
  let z: Complex = { re: sign, im: 0 }, w: Complex = { re: 1, im: 0 };
  const inverseRadiusSquared = inverseRadius * inverseRadius;
  for (let n = 0; n <= limit; n++) {
    const zr = z.re * z.re + z.im * z.im, wr = w.re * w.re + w.im * w.im;
    if (!Number.isFinite(zr + wr) || zr + wr === 0) return -1;
    if (wr < inverseRadiusSquared * zr || (wr === 0 && zr > 0)) return n;
    if (n === limit) return -1;
    const zz = multiply(z, z), ww = multiply(w, w), zw = multiply(z, w), middle = multiply(t, zw);
    const nextZ = { re: zz.re + middle.re + ww.re, im: zz.im + middle.im + ww.im };
    const nextW = multiply(mu, zw);
    const scale = Math.max(Math.abs(nextZ.re), Math.abs(nextZ.im), Math.abs(nextW.re), Math.abs(nextW.im));
    if (!Number.isFinite(scale) || scale === 0) return -1;
    z = { re: nextZ.re / scale, im: nextZ.im / scale };
    w = { re: nextW.re / scale, im: nextW.im / scale };
  }
  return -1;
}

export function mixedSliceEscape(q: Complex, mu: Complex, limit: number) {
  const radius = Math.hypot(mu.re, mu.im);
  if (!Number.isFinite(radius) || radius === 0 || radius >= 1 || !Number.isFinite(q.re + q.im)) return -1;
  const { t, inverseRadius } = mixedSliceNormalForm(q, mu);
  const first = mixedCriticalEscape(1, t, mu, inverseRadius, limit);
  if (first < 0) return -1;
  const second = mixedCriticalEscape(-1, t, mu, inverseRadius, limit);
  return second < 0 ? -1 : Math.max(first, second);
}
