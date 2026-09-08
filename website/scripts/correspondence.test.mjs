import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import katex from 'katex';
import { correspondenceR as R, correspondenceDerivative, reflectedR, correspondenceCriticalPoints, createTileBoundary, locateFundamentalTile, exteriorInverse, classifyMating, classifyCorrespondence, renderCorrespondenceGrid, CORRESPONDENCE_VIEW, MIN_C, MAX_C, TILING, NON_ESCAPING, UNRESOLVED } from '../lib/correspondence.ts';
import { correspondenceColour, describeCorrespondencePoint, CORRESPONDENCE_FORMULA, CORRESPONDENCE_RELATION } from '../lib/correspondence-display.ts';

const cs = [-.6, -.5, -.25, 0, .25, .5, .6];
const polar = (r, t) => ({re:r*Math.cos(t), im:r*Math.sin(t)});
const inverse = ({re,im}) => ({re:re/(re*re+im*im),im:-im/(re*re+im*im)});
const near = (a,b,eps=1e-10) => assert.ok(Math.hypot(a.re-b.re,a.im-b.im)<eps, `${JSON.stringify(a)} differs from ${JSON.stringify(b)}`);

test('Example 4 formula, parity, conjugation and holomorphic reciprocal', () => {
  for (const c of cs) {
    near(R({re:1,im:0},c),{re:1.2+2*c/3,im:0});
    near(R({re:0,im:1},c),{re:0,im:.8-4*c/3});
    for(let i=0;i<20;i++) {
      const z=polar(.6+i*.09,.31+i*.21), w=R(z,c);
      near(R({re:-z.re,im:-z.im},c),{re:-w.re,im:-w.im});
      near(R({re:z.re,im:-z.im},c),{re:w.re,im:-w.im});
      near(reflectedR(z,c),R(inverse(z),c));
    }
  }
});

test('the six unit-circle cusp critical points are correct and remain unresolved', () => {
  for(const c of cs) {
    const tile=createTileBoundary(c), points=correspondenceCriticalPoints(c);
    assert.equal(points.length,6);
    for(const z of points) {
      near(correspondenceDerivative(z,c),{re:0,im:0});
      assert.equal(locateFundamentalTile(R(z,c),tile),0);
      assert.equal(classifyCorrespondence(z,c,120,tile).kind,UNRESOLVED);
    }
  }
});

test('the unique exterior inverse recovers exterior points, including near the boundary', () => {
  for(const c of cs) for(const r of [1.001,1.01,1.1,1.5,2,3]) for(let i=0;i<36;i++) {
    const z=polar(r,2*Math.PI*(i+.17)/36), root=exteriorInverse(R(z,c),c);
    assert.ok(root,`inverse missing for c=${c}, r=${r}, angle=${i}`);
    assert.ok(Math.hypot(root.re,root.im)>1);
    near(root,z,2e-8);
  }
});

test('the conservative chord margin contains the exact rank-zero tile boundary', () => {
  for(const c of cs) {
    const tile=createTileBoundary(c);
    assert.equal(locateFundamentalTile({re:0,im:0},tile),c === .6 ? 0 : 1);
    assert.equal(locateFundamentalTile({re:4,im:0},tile),-1);
    for(let i=0;i<1000;i++) assert.equal(locateFundamentalTile(R(polar(1,2*Math.PI*(i+.37)/1000),c),tile),0);
  }
});

test('near-circle inverse seeds avoid attraction to a nearby interior root', () => {
  const w={re:.22310639649,im:1.52701405355};
  const root=exteriorInverse(w,-.5);
  assert.ok(root && Math.hypot(root.re,root.im)>1);
  near(R(root,-.5),w);
  for(const re of [-.371875,.371875]) for(const im of [-.9385416666666667,.9385416666666667]) assert.notEqual(classifyCorrespondence({re,im},-.5,64).reason,'inverse');
});

test('infinity is non-escaping, not tiling escape; failed arithmetic stays unresolved', () => {
  for(const c of cs) {
    const tile=createTileBoundary(c);
    for(const z of [{re:0,im:0},{re:.05,im:.03},{re:6,im:0},{re:Infinity,im:0}]) assert.equal(classifyCorrespondence(z,c,64,tile).kind,NON_ESCAPING);
    for(const w of [{re:4,im:0},{re:0,im:-5},{re:Infinity,im:0}]) assert.equal(classifyMating(w,c,64,tile).kind,NON_ESCAPING);
    assert.equal(classifyMating({re:0,im:0},c,64,tile).kind,c === .6 ? UNRESOLVED : TILING);
    assert.equal(classifyCorrespondence({re:NaN,im:0},c,64,tile).kind,UNRESOLVED);
    assert.equal(classifyMating({re:NaN,im:0},c,64,tile).kind,UNRESOLVED);
  }
});

test('iteration exhaustion is not treated as membership of K or the limit set', () => {
  const result=classifyMating({re:2,im:0},0,0);
  assert.equal(result.kind,UNRESOLVED);
  assert.equal(result.reason,'depth');
  assert.match(describeCorrespondencePoint(result),/Unresolved/);
  assert.equal(classifyMating({re:2,im:0},0,64).kind,NON_ESCAPING);
});

test('the c=0 tile lifts to six sectors and also appears at reciprocal points', () => {
  for(let i=0;i<6;i++) {
    const z=polar(Math.pow(.2,1/6),(2*i+1)*Math.PI/6);
    near(R(z,0),{re:0,im:0});
    assert.equal(classifyCorrespondence(z,0,64).kind,TILING);
    assert.equal(classifyCorrespondence(inverse(z),0,64).kind,TILING);
  }
});

test('resolved classifications respect reciprocal, odd and real-conjugation symmetry', () => {
  for(const c of cs) {
    const tile=createTileBoundary(c);
    for(let i=1;i<=700;i++) {
      const z=polar(.24+(i*137%2000)/1000,(i*317%2000)*Math.PI/1000);
      const a=classifyCorrespondence(z,c,64,tile);
      for(const p of [inverse(z),{re:-z.re,im:-z.im},{re:z.re,im:-z.im}]) {
        const b=classifyCorrespondence(p,c,64,tile);
        if(a.kind && b.kind) assert.equal(a.kind,b.kind);
      }
      assert.deepEqual(a,classifyMating(R(z,c),c,64,tile));
    }
  }
});

test('rasters retain separate classifications and a resolved-side interface only', () => {
  for(const c of [-.5,0,.5]) {
    const progress=[];
    const grid=renderCorrespondenceGrid(c,CORRESPONDENCE_VIEW,96,64,p=>progress.push(p));
    assert.ok(grid.counts.nonEscaping>1000 && grid.counts.tiling>1000);
    assert.equal(grid.counts.nonEscaping+grid.counts.tiling+grid.counts.unresolved,96*96);
    assert.ok(grid.counts.inverseFailures <= grid.counts.unresolved);
    assert.ok(grid.boundary.some(Boolean));
    assert.ok(progress.every((p,i)=>p>0 && p<=1 && (!i || p>progress[i-1])));
    for(let i=0;i<grid.kinds.length;i++) {
      if(!grid.kinds[i]) {
        assert.equal(grid.boundary[i],0);
        for(const layer of ['limit','tiling','non-escaping']) assert.deepEqual(correspondenceColour(grid,i,layer),[170,178,185]);
      }
      if(grid.boundary[i]) {
        const x=i%96,y=Math.floor(i/96);
        assert.ok([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>a>=0 && a<96 && b>=0 && b<96 && grid.kinds[b*96+a] && grid.kinds[b*96+a]!==grid.kinds[i]));
      }
    }
  }
});

test('unsupported parameters and invalid raster inputs are rejected', () => {
  for(const c of [-.6001,.6001,NaN,Infinity]) assert.throws(()=>renderCorrespondenceGrid(c,CORRESPONDENCE_VIEW,64,64),RangeError);
  for(const size of [0,-1,3.5,2048,NaN]) assert.throws(()=>renderCorrespondenceGrid(0,CORRESPONDENCE_VIEW,size,64),RangeError);
  for(const depth of [-1,2.5,2048,NaN]) assert.throws(()=>renderCorrespondenceGrid(0,CORRESPONDENCE_VIEW,64,depth),RangeError);
  assert.throws(()=>renderCorrespondenceGrid(0,{re:0,im:0,span:0},64,64),RangeError);
  assert.throws(()=>createTileBoundary(0,NaN),RangeError);
});

test('formulas render as accessible mathematics and Laboratory mounts the new workbench', () => {
  for(const formula of [CORRESPONDENCE_FORMULA,CORRESPONDENCE_RELATION]) {
    const html=katex.renderToString(formula,{throwOnError:true,output:'htmlAndMathml'});
    assert.match(html,/<math/); assert.match(html,/<mfrac>/); assert.doesNotMatch(html,/katex-error/);
  }
  const app=readFileSync(new URL('../components/lab-page.tsx',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../components/correspondence-explorer.tsx',import.meta.url),'utf8');
  assert.match(app,/<CorrespondenceExplorer \/>/);
  assert.match(ui,/usePlaneNavigation/);
  assert.match(ui,/worker\?\.terminate\(\)/);
  assert.match(ui,/previous c/);
  assert.match(ui,/A Family of Correspondences/);
  assert.match(ui,/Auto · screen density/);
  assert.match(ui,/1536²/);
  assert.doesNotMatch(ui,/What is being computed|These are finite numerical approximations/);
});

test('the exact pinching endpoints retain their boundary contacts', () => {
  near(R({re:0,im:1},.6),{re:0,im:0});
  near(R({re:0,im:-1},.6),{re:0,im:0});
  const upper={re:0,im:4*Math.SQRT2/5};
  for(const angle of [Math.PI/4,3*Math.PI/4]) near(R(polar(1,angle),-.6),upper);
  for(const [c,w] of [[.6,{re:0,im:0}],[-.6,upper],[-.6,{re:0,im:-upper.im}]]) {
    assert.equal(locateFundamentalTile(w,createTileBoundary(c)),0);
    assert.equal(classifyMating(w,c,240).kind,UNRESOLVED);
  }
});

test('the public Laboratory exposes only the original round-model correspondence', () => {
  const suite=readFileSync(new URL('../components/correspondence-explorer.tsx',import.meta.url),'utf8');
  assert.match(suite,/export function CorrespondenceExplorer\(\)\s*\{\s*return <VerifiedRoundCorrespondenceExplorer \/>;/);
  assert.doesNotMatch(suite,/Post-pinching branches|Ramified exploration|Three mathematical regimes|AlgebraicCorrespondenceExplorer|correspondence-mode-selector/);
  assert.match(suite,/Pinched limit/);
  assert.match(suite,/min=\{MIN_C\} max=\{MAX_C\}/);
  assert.equal(MIN_C,-0.6);
  assert.equal(MAX_C,0.6);
});
