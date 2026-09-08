import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quadraticOrbit, quadraticEscape, sliceEscape, sliceNormalForm, mixedSliceNormalForm, mixedSliceEscape, complexSqrt, openDiskMultiplier, MAX_MOTION_RADIUS, multiply, planePoint, planePosition, zoomView, PARAMETER_VIEW } from '../lib/dynamics.ts';

test('critical orbits: fixed point, two-cycle, escape at final iterate', () => {
  assert.deepEqual(quadraticOrbit({re:0, im:0}, {re:-1, im:0}, 4).points.map(z=>z.re), [0,-1,0,-1,0]);
  assert.equal(quadraticOrbit({re:0, im:0}, {re:0, im:0}, 100).escapedAt, null);
  assert.equal(quadraticOrbit({re:0, im:0}, {re:2, im:0}, 2).escapedAt, 2);
  assert.ok(quadraticEscape(0,0,2,0,2) >= 0);
});

test('raster and orbit escape classification agree', () => {
  for (let re=-2; re<=2; re+=.125) for(let im=-1.5; im<=1.5; im+=.125) {
    for(const limit of [1,2,10,50]) {
      assert.equal(quadraticEscape(0,0,re,im,limit)<0, quadraticOrbit({re:0,im:0},{re,im},limit).escapedAt===null);
    }
  }
});

test('coordinate mapping is invertible and positive imaginary points appear above zero', () => {
  for(const x of [0,.3,1]) for(const y of [0,.7,1]) {
    const position = planePosition(PARAMETER_VIEW, planePoint(PARAMETER_VIEW,x,y));
    assert.ok(Math.abs(x-position.x) < 1e-12 && Math.abs(y-position.y) < 1e-12);
  }
  assert.ok(planePosition(PARAMETER_VIEW,{re:0,im:1}).y < .5);
  assert.equal(zoomView(PARAMETER_VIEW,{re:1,im:2},2).span,7);
  assert.equal(zoomView({...PARAMETER_VIEW,span:100},PARAMETER_VIEW,2,120).span,120);
});

test('the zero multiplier slice is exactly the polynomial raster', () => {
  for(let re=-2;re<1;re+=.1) for(let im=-1;im<1;im+=.1) assert.equal(sliceEscape({re,im},{re:0,im:0},80),quadraticEscape(0,0,re,im,80));
});

test('normal-form multiplier identity and critical equations', () => {
  for(const mu of [{re:.3,im:.2},{re:-.85,im:0},{re:0,im:.7},{re:1e-9,im:0}]) {
    for(let re=-4;re<=2;re+=.4) for(let im=-2;im<=2;im+=.4) {
      const q={re,im};
      const {beta,critical1,critical2,radius}=sliceNormalForm(q,mu);
      const b2=multiply(beta,beta), mq=multiply(mu,q);
      const product=multiply({re:2-mu.re+4*mq.re,im:-mu.im+4*mq.im},beta);
      assert.ok(Math.hypot(b2.re-product.re+4*q.re,b2.im-product.im+4*q.im)<1e-8);
      for(const z of [critical1,critical2]) {
        const square=multiply(mu,multiply(z,z));
        const residual=Math.hypot(square.re+2*z.re+beta.re,square.im+2*z.im+beta.im);
        assert.ok(residual/(1+Math.hypot(z.re,z.im)) < 1e-7);
      }
      assert.ok(Number.isFinite(radius) && radius>0);
    }
  }
});

test('known connected slice centers and conjugation symmetry', () => {
  for(const mu of [{re:.5,im:0},{re:-.85,im:0},{re:0,im:.5}]) {
    assert.equal(sliceEscape({re:0,im:0},mu,180),-1);
  }
  assert.equal(sliceEscape({re:-17.52777777777778,im:0},{re:-.85,im:0},350),-1);
  for(let re=-2;re<1;re+=.1) for(let im=-1;im<1;im+=.1) {
    assert.equal(sliceEscape({re,im},{re:.3,im:.2},100)<0,sliceEscape({re,im:-im},{re:.3,im:-.2},100)<0);
  }
});

test('near-axis square roots preserve small components', () => {
  for(const re of [5,-5]) for(const im of [1e-8,-1e-8,0]) {
    const root=complexSqrt({re,im}), square=multiply(root,root);
    assert.ok(Math.abs(square.re-re)<1e-14);
    assert.ok(Math.abs(square.im-im)<1e-22);
  }
  assert.deepEqual(complexSqrt({re:0,im:0}),{re:0,im:0});
});

test('motion selection excludes the unit circle in every direction', () => {
  for(let i=0;i<1000;i++) {
    const angle=i*Math.PI/500;
    for(const radius of [.99,1,2,MAX_MOTION_RADIUS]) {
      const mu=openDiskMultiplier({re:radius*Math.cos(angle),im:radius*Math.sin(angle)});
      assert.ok(Math.hypot(mu.re,mu.im)<1);
    }
  }
  assert.equal(sliceEscape({re:2,im:0},{re:1,im:0},100),-1);
  assert.equal(sliceEscape({re:NaN,im:0},{re:.9,im:0},100),-1);
});

test('the mixed chart preserves its invariant and avoids the near-one cancellation', () => {
  for(const mu of [{re:.99,im:0},{re:0,im:.9999},{re:.7,im:.7},{re:1-1e-12,im:0}]) {
    for(const q of [{re:2,im:0},{re:-1,im:1e-9},{re:.25,im:0}]) {
      const {t,inverseRadius}=mixedSliceNormalForm(q,mu), t2=multiply(t,t);
      const product=multiply(multiply(mu,mu),{re:1-4*q.re,im:-4*q.im});
      assert.ok(Math.hypot(t2.re-4*(1-mu.re)-product.re,t2.im+4*mu.im-product.im)<1e-13);
      assert.ok(inverseRadius>0 && Number.isFinite(inverseRadius));
    }
  }
  assert.ok(mixedSliceEscape({re:2,im:0},{re:.99,im:0},1500)>=0);
  assert.equal(mixedSliceEscape({re:2,im:0},{re:.99999999,im:0},1000),-1);
});
