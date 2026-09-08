import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { iterate, multiply, planePoint, quadraticOrbit } from '../lib/dynamics.ts';
import { JULIA_PRESETS, matchingJuliaPreset } from '../lib/julia-presets.ts';
import { transformPlane, pinchPlane, scrollPlane, rasterTransform } from '../lib/plane-navigation.ts';
import { DOUBLING_CENTRES, FEIGENBAUM, LANDMARKS, RABBIT_ROOT, realOrbitTail } from '../lib/mandelbrot-landmarks.ts';
import * as labels from '../lib/laboratory-labels.ts';

const zero = { re: 0, im: 0 };
const near = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const samePoint = (a, b) => { near(a.re, b.re); near(a.im, b.im); };
const preset = (id) => JULIA_PRESETS.find((p) => p.id === id);

test('thirteen distinct named presets with precise parameters', () => {
  assert.equal(JULIA_PRESETS.length, 13);
  assert.equal(new Set(JULIA_PRESETS.map(p => p.id)).size, 13);
  for (const p of JULIA_PRESETS) {
    assert.ok(Number.isFinite(p.re) && Number.isFinite(p.im));
    assert.equal(matchingJuliaPreset(p)?.id, p.id);
  }
  assert.equal(matchingJuliaPreset({re:0.1,im:0.2}), undefined);
  assert.equal(preset('siegel').approximate, true);
  assert.equal(preset('feigenbaum').approximate, true);
});

test('superattracting examples return after their stated primitive period', () => {
  for (const [id, period] of [['basilica',2], ['rabbit',3], ['corabbit',3], ['airplane',3], ['double-basilica',4]]) {
    const points = quadraticOrbit(zero, preset(id), period).points;
    assert.equal(points.length, period + 1);
    assert.ok(Math.hypot(points[period].re, points[period].im) < 1e-12);
    for (let i=1; i<period; i++) assert.ok(Math.hypot(points[i].re, points[i].im)>1e-4);
  }
  near(preset('rabbit').re, preset('corabbit').re);
  near(preset('rabbit').im, -preset('corabbit').im);
});

test('all five period-doubling centers have the stated period', () => {
  for (const {period,c} of DOUBLING_CENTRES) {
    const points = quadraticOrbit(zero,{re:c,im:0},period).points;
    assert.ok(Math.abs(points[period].re)<1e-10);
    for(let i=1;i<period;i++) assert.ok(Math.abs(points[i].re)>1e-4);
  }
  near(FEIGENBAUM, preset('feigenbaum').re);
});

test('Misiurewicz example lands on a repelling cycle, not a critical cycle', () => {
  assert.deepEqual(quadraticOrbit(zero,preset('dendrite'),5).points, [zero,{re:0,im:1},{re:-1,im:1},{re:0,im:-1},{re:-1,im:1},{re:0,im:-1}]);
  const multiplier = multiply({re:-2,im:2},{re:0,im:-2});
  assert.deepEqual(multiplier,{re:4,im:4});
  assert.ok(Math.hypot(multiplier.re,multiplier.im)>1);
  assert.notEqual(quadraticOrbit(zero,preset('cantor'),100).escapedAt,null);
});

test('neutral and satellite parameters obey their defining multiplier equations', () => {
  for (const [c, fixed] of [[preset('cauliflower'),{re:.5,im:0}],[preset('san-marco'),{re:-.5,im:0}],[RABBIT_ROOT,{re:-.25,im:Math.sqrt(3)/4}]]) samePoint(iterate(fixed,c),fixed);
  const theta = 2*Math.PI*(Math.sqrt(5)-1)/2;
  const lambda = {re:Math.cos(theta),im:Math.sin(theta)};
  const square = multiply(lambda,lambda);
  samePoint(preset('siegel'),{re:lambda.re/2-square.re/4,im:lambda.im/2-square.im/4});
  assert.equal(LANDMARKS.length,4);
});

test('real orbit diagram keeps bounded endpoints and labels a finite critical tail', () => {
  assert.deepEqual(realOrbitTail(-2,10,3),[2,2,2]);
  assert.deepEqual(realOrbitTail(0,10,3),[0,0,0]);
  assert.deepEqual(realOrbitTail(-1,10,4),[-1,0,-1,0]);
  assert.deepEqual(realOrbitTail(1,10,3),[]);
  for(let c=-2;c<=.25;c+=.025) for(const x of realOrbitTail(c)) assert.ok(Number.isFinite(x) && Math.abs(x)<=2);
});

test('dragging and pointer-anchored zoom preserve the selected screen anchor', () => {
  const view = {re:-.65,im:.2,span:3.5};
  const from = {x:.23,y:.68}, to = {x:.61,y:.41};
  for(const factor of [.00000001,.2,1,2,1000]) {
    const next = transformPlane(view,from,to,factor);
    samePoint(planePoint(view,from.x,from.y),planePoint(next,to.x,to.y));
    assert.ok(next.span>=.00002 && next.span<=12);
  }
  const right = transformPlane(view,{x:.5,y:.5},{x:.6,y:.5});
  assert.ok(right.re<view.re);
  const down = transformPlane(view,{x:.5,y:.5},{x:.5,y:.6});
  assert.ok(down.im>view.im);
  assert.equal(transformPlane(view,from,to,NaN),view);
});

test('two-finger spread zooms in, follows its midpoint, and supports a subsequent one-finger pan', () => {
  const view={re:0,im:0,span:4};
  const before=[{x:.4,y:.5},{x:.6,y:.5}], after=[{x:.4,y:.4},{x:.8,y:.4}];
  const pinched=pinchPlane(view,before,after);
  near(pinched.span,2);
  samePoint(planePoint(view,.5,.5),planePoint(pinched,.6,.4));
  const dragged=transformPlane(pinched,after[0],{x:.5,y:.6});
  samePoint(planePoint(pinched,.4,.4),planePoint(dragged,.5,.6));
  assert.equal(pinchPlane(view,[before[0],before[0]],after),view);
});

test('wheel units agree, ordinary scroll pans, pinch/zoom holds the pointer', () => {
  const view={re:0,im:0,span:4}, point={x:.7,y:.3}, box={width:400,height:400};
  const a=scrollPlane(view,point,{x:16,y:32,mode:0},box,false);
  const b=scrollPlane(view,point,{x:1,y:2,mode:1},box,false);
  assert.deepEqual(a,b); assert.ok(a.re>0 && a.im<0); near(a.span,4);
  const zoomed=scrollPlane(view,point,{x:0,y:-50,mode:0},box,true);
  assert.ok(zoomed.span<4);
  samePoint(planePoint(view,point.x,point.y),planePoint(zoomed,point.x,point.y));
});

test('progressive raster transform follows the same complex-plane geometry', () => {
  const old={re:-.65,im:.2,span:3.5}, next={re:-.3,im:-.1,span:1.4};
  const raster=rasterTransform(old,next);
  for (const p of [{x:0,y:0},{x:.7,y:.2},{x:1,y:1}]) samePoint(planePoint(old,p.x,p.y),planePoint(next,raster.x/100+p.x*raster.scale,raster.y/100+p.y*raster.scale));
});

test('laboratory formulas have real mathematical typesetting and accessible MathML', () => {
  for(const html of Object.values(labels).filter(value => typeof value === 'string')) {
    assert.match(html, /class="katex"/);
    assert.match(html, /<math/);
    assert.doesNotMatch(html, /katex-error/);
  }
  assert.match(labels.quadraticFormulaHtml, /<msup>/);
  for (const [file,title] of [['dynamics-explorer.tsx','The Quadratic Explorer'],['mandelbrot-motion.tsx','Moving the External Maps']]) {
    const source=readFileSync(new URL(`../components/${file}`,import.meta.url),'utf8');
    assert.ok(source.includes(title));
    assert.doesNotMatch(source, /01 \/ Parameter|02 \/ The multiplier|A moving Mandelbrot set/);
  }
});

test('orbit labels use true subscripts, including zero and multi-digit indices', () => {
  for (const index of [0, 1, 10, 24, 80]) {
    const html = labels.indexedZHtml(index);
    assert.ok(html.includes(`<msub><mi>z</mi><mn>${index}</mn></msub>`));
    assert.match(html, /class="katex"/);
    assert.doesNotMatch(html, /katex-error/);
  }
  assert.match(labels.indexedZHtml('n'), /<msub><mi>z<\/mi><mi>n<\/mi><\/msub>/);
  for (const invalid of [-1, 0.5, Infinity, NaN, 'o']) {
    assert.throws(() => labels.indexedZHtml(invalid), RangeError);
  }
  const source = readFileSync(new URL('../components/dynamics-explorer.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /[₀-₉ₙ]/);
  assert.match(source, /accessibleLabel="z subscript zero"/);
  assert.match(source, /aria-label=\{`\$\{accessibleLabel\} real part`\}/);
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.plane-panel header span\s*\{/);
});
