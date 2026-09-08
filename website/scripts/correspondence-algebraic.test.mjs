import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { correspondenceDerivative, correspondenceR } from '../lib/correspondence.ts';
import {
  absComplex,
  addComplex,
  chordalDistance,
  complex,
  conjugateComplex,
  integerPower,
  multiplyComplex,
  scaleComplex,
  solveAllPolynomialRoots,
  subtractComplex,
} from '../lib/complex-roots.ts';
import {
  ALGEBRAIC_MAX_C,
  ALGEBRAIC_MIN_C,
  SPHERE_INFINITY,
  conjugateSpherePoint,
  correspondenceCriticalData,
  createCircleImage,
  finiteSpherePoint,
  locateWindingCell,
  matchBranchLabels,
  parameterBand,
  relationIdentityResidual,
  renderWindingGrid,
  solveCorrespondenceFibre,
  sphereChordalDistance,
  validatePostPinchingParameter,
  validateRamifiedParameter,
} from '../lib/correspondence-algebraic.ts';
import {
  MAX_SURVIVAL_RASTER_WORK,
  SURVIVAL_ALL,
  SURVIVAL_NONE,
  SURVIVAL_SOME,
  SURVIVAL_UNRESOLVED,
  buildCorrespondenceOrbitTree,
  classifyFiniteBranchSurvival,
  estimateSurvivalWork,
  renderFiniteBranchSurvivalGrid,
} from '../lib/correspondence-survival.ts';
import {
  BRANCH_TRACKING_CAUTION,
  CORRESPONDENCE_ALL_FORMULA,
  CORRESPONDENCE_EXISTS_FORMULA,
  CORRESPONDENCE_FIBRE_FORMULA,
  CORRESPONDENCE_MODE_BADGES,
  FINITE_DEPTH_CAUTION,
  RAMIFIED_MODE_CAUTION,
  describeCorrespondenceFibre,
  describeFiniteSurvival,
  survivalColour,
  windingColour,
} from '../lib/correspondence-algebraic-display.ts';

const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);
const nearPoint = (a, b, epsilon = 1e-8) => assert.ok(chordalDistance(a, b) <= epsilon, `${JSON.stringify(a)} differs from ${JSON.stringify(b)}`);
const finiteCritical = data => data.filter(item => item.source === 'finite');
const expandImages = fibre => fibre.images.flatMap(image => Array.from({ length: image.multiplicity }, () => image.y));

test('parameter bands keep the three mathematical regimes distinct', () => {
  assert.equal(parameterBand(0), 'round-interior');
  assert.equal(parameterBand(-.6), 'pinched-endpoint');
  assert.equal(parameterBand(.6), 'pinched-endpoint');
  assert.equal(parameterBand(-.7), 'post-pinched');
  assert.equal(parameterBand(.7), 'post-pinched');
  assert.equal(parameterBand(-1), 'ramification-transition');
  assert.equal(parameterBand(3), 'ramification-transition');
  assert.equal(parameterBand(3.01), 'ramified');
  for (const c of [-.999, 0, 2.999]) assert.doesNotThrow(() => validatePostPinchingParameter(c));
  for (const c of [ALGEBRAIC_MIN_C, ALGEBRAIC_MAX_C, -1.01, 3.01]) assert.throws(() => validatePostPinchingParameter(c), RangeError);
  for (const c of [-2, -1, 3, 4]) assert.doesNotThrow(() => validateRamifiedParameter(c));
  for (const c of [-.999, 0, 2.999]) assert.throws(() => validateRamifiedParameter(c), RangeError);
  for (const fn of [parameterBand, validatePostPinchingParameter, validateRamifiedParameter]) for (const c of [NaN, Infinity]) assert.throws(() => fn(c), RangeError);
});

test('the derivative factorization holds in every real regime', () => {
  for (const c of [-2, -1, -.6, 0, .6, 3, 4]) for (let index = 0; index < 12; index++) {
    const z = { re: .4 + .13 * index, im: .27 + .09 * index };
    const z2 = integerPower(z, 2), z4 = integerPower(z, 4), z6 = integerPower(z, 6);
    const left = multiplyComplex(correspondenceDerivative(z, c), z6);
    const right = multiplyComplex(subtractComplex(z2, complex(1)), addComplex(addComplex(z4, scaleComplex(z2, 1 - c)), complex(1)));
    nearPoint(left, right, 2e-11);
  }
});

test('critical multiplicities and the four real transition values are explicit', () => {
  const atMinusOne = finiteCritical(correspondenceCriticalData(-1));
  assert.deepEqual(atMinusOne.map(item => item.derivativeMultiplicity).sort((a, b) => a - b), [1, 1, 2, 2]);
  const atThree = finiteCritical(correspondenceCriticalData(3));
  assert.deepEqual(atThree.map(item => item.derivativeMultiplicity), [3, 3]);
  for (const c of [-.6, .6]) {
    const points = finiteCritical(correspondenceCriticalData(c));
    assert.equal(points.length, 6);
    assert.ok(points.every(item => item.onUnitCircle));
  }
  nearPoint(correspondenceR({ re: 0, im: 1 }, .6), correspondenceR({ re: 0, im: -1 }, .6), 1e-12);
  const diagonal = angle => ({ re: Math.cos(angle), im: Math.sin(angle) });
  nearPoint(correspondenceR(diagonal(Math.PI / 4), -.6), correspondenceR(diagonal(3 * Math.PI / 4), -.6), 1e-12);
  nearPoint(correspondenceR(diagonal(5 * Math.PI / 4), -.6), correspondenceR(diagonal(7 * Math.PI / 4), -.6), 1e-12);
  for (const c of [-1.2, 3.2]) {
    const radii = finiteCritical(correspondenceCriticalData(c)).map(item => absComplex(item.point.value));
    assert.ok(radii.some(radius => radius < 1 - 1e-6));
    assert.ok(radii.some(radius => radius > 1 + 1e-6));
  }
  const pole = correspondenceCriticalData(0).find(item => item.source === 'pole');
  assert.equal(pole.derivativeMultiplicity, 4);
  assert.equal(pole.value.kind, 'infinity');
});

test('the direct bidegree relation agrees with the cleared fibre identity', () => {
  for (const c of [-1.3, -.6, 0, .7, 3.4]) for (let index = 0; index < 20; index++) {
    const x = { re: .31 + index * .07, im: -.43 + index * .051 };
    const y = { re: -.72 + index * .033, im: .19 + index * .047 };
    assert.ok(relationIdentityResidual(x, y, c) < 2e-13);
  }
});

test('the deterministic all-roots solver residual-checks simple and repeated roots', () => {
  const simple = solveAllPolynomialRoots([complex(1), complex(0), complex(-7), complex(6)]);
  assert.equal(simple.complete, true);
  for (const expected of [1, 2, -3]) assert.ok(simple.roots.some(root => absComplex(subtractComplex(root.value, complex(expected))) < 1e-8));
  const repeated = solveAllPolynomialRoots([complex(1), complex(-3), complex(3), complex(-1)]);
  assert.equal(repeated.complete, true);
  assert.equal(repeated.roots.length, 3);
  assert.equal(repeated.clusters.length, 1);
  assert.equal(repeated.clusters[0].multiplicity, 3);
  assert.ok(repeated.maxScaledResidual < 2e-10);
});

test('generic fibres retain all five images and verify them in two polynomial charts', () => {
  const inputs = [{ re: 1.21, im: .37 }, { re: -.82, im: .91 }, { re: .44, im: -.73 }];
  for (const c of [-1.4, -.8, -.6, 0, .6, .8, 2.8, 3.2]) for (const x of inputs) {
    const fibre = solveCorrespondenceFibre(finiteSpherePoint(x), c);
    assert.notEqual(fibre.status, 'unresolved', `unresolved at c=${c}, x=${JSON.stringify(x)}`);
    assert.equal(fibre.trivialRootRemoved, true);
    assert.equal(fibre.totalMultiplicity, 5);
    assert.equal(expandImages(fibre).length, 5);
    assert.ok(fibre.diagnostics.crossChartAgreement < 2e-5);
    for (const image of fibre.images) {
      assert.ok(image.fibreResidual < 2e-10);
      assert.ok(image.relationResidual < 2e-10);
    }
  }
});

test('critical fibres remove one trivial occurrence, not the whole multiple root', () => {
  const cases = [
    { c: 0, x: { re: 1, im: 0 }, y: { re: 1, im: 0 }, multiplicity: 1 },
    { c: -1, x: { re: 0, im: 1 }, y: { re: 0, im: -1 }, multiplicity: 2 },
    { c: 3, x: { re: 1, im: 0 }, y: { re: 1, im: 0 }, multiplicity: 3 },
  ];
  for (const item of cases) {
    const fibre = solveCorrespondenceFibre(finiteSpherePoint(item.x), item.c);
    assert.equal(fibre.status, 'near-multiple');
    assert.equal(fibre.totalMultiplicity, 5);
    const image = fibre.images.find(candidate => candidate.y.kind === 'finite' && chordalDistance(candidate.y.value, item.y) < 1e-7);
    assert.equal(image?.multiplicity, item.multiplicity);
  }
});

test('the pole and infinity fibres preserve projective multiplicity five', () => {
  const zero = solveCorrespondenceFibre(finiteSpherePoint(complex(0)), .7);
  assert.equal(zero.status, 'projective-special');
  assert.equal(zero.totalMultiplicity, 5);
  assert.equal(zero.images.find(image => image.y.kind === 'infinity')?.multiplicity, 4);
  assert.equal(zero.images.find(image => image.y.kind === 'finite' && absComplex(image.y.value) === 0)?.multiplicity, 1);
  const infinity = solveCorrespondenceFibre(SPHERE_INFINITY, 4);
  assert.equal(infinity.totalMultiplicity, 5);
  assert.equal(infinity.images[0].y.kind, 'infinity');
  assert.equal(infinity.images[0].multiplicity, 5);
});

test('real conjugation carries each numerical fibre to the conjugate fibre', () => {
  for (const c of [-1.2, -.7, 0, .8, 3.2]) {
    const x = { re: .83, im: .47 };
    const first = expandImages(solveCorrespondenceFibre(finiteSpherePoint(x), c));
    const second = expandImages(solveCorrespondenceFibre(finiteSpherePoint(conjugateComplex(x)), c));
    assert.equal(first.length, 5); assert.equal(second.length, 5);
    for (const image of first) assert.ok(second.some(candidate => sphereChordalDistance(conjugateSpherePoint(image), candidate) < 2e-6));
  }
});

test('circle images expose winding cells, boundary uncertainty and post-pinch intersections', () => {
  const round = createCircleImage(0, 1024);
  assert.equal(round.intersections.length, 0);
  assert.deepEqual(locateWindingCell({ re: 0, im: 0 }, round), { winding: 1, reason: 'cell' });
  assert.deepEqual(locateWindingCell({ re: 5, im: 0 }, round), { winding: 0, reason: 'cell' });
  assert.equal(locateWindingCell(round.points[17], round).reason, 'boundary');
  assert.ok(createCircleImage(.7, 1024).intersections.length > 0);
  assert.ok(createCircleImage(-.7, 1024).intersections.length > 0);
  const progress = [];
  const grid = renderWindingGrid(.7, { re: 0, im: 0, span: 4.5 }, 32, value => progress.push(value));
  assert.equal(grid.windings.length, 32 * 32);
  assert.equal(Object.values(grid.counts).reduce((sum, count) => sum + count, 0), 32 * 32);
  assert.equal(progress.at(-1), 1);
  assert.deepEqual(windingColour(grid, 0).length, 3);
});

function mockFibre(values, status = 'residual-checked') {
  const images = values.map((entry, index) => ({ id: `sheet-${index + 1}`, zeta: entry.point, y: entry.point, multiplicity: entry.multiplicity, fibreResidual: 0, relationResidual: 0, nearMultiple: false, clusterId: index }));
  return { c: 0, x: finiteSpherePoint(complex(0)), w: finiteSpherePoint(complex(0)), allSixRoots: null, relationRoots: null, trivialRootRemoved: true, images, distinctImageCount: images.length, totalMultiplicity: images.reduce((sum, image) => sum + image.multiplicity, 0), status, diagnostics: { residualTolerance: 1e-10, clusterTolerance: 1e-7, crossChartAgreement: 0 } };
}

test('finite-depth survival distinguishes universal, existential, escape and unresolved cases', () => {
  const view = { re: 0, im: 0, span: 4 }, root = finiteSpherePoint(complex(0));
  const classify = (solver, nodeCap = 20) => classifyFiniteBranchSurvival({ c: 0, root, view, depth: 1, nodeCap, branchSolver: solver });
  const all = classify(() => mockFibre([{ point: finiteSpherePoint(complex(.5)), multiplicity: 5 }]));
  assert.equal(all.kind, SURVIVAL_ALL); assert.equal(all.existsThroughDepth, true); assert.equal(all.allThroughDepth, true);
  const some = classify(() => mockFibre([{ point: finiteSpherePoint(complex(.5)), multiplicity: 1 }, { point: finiteSpherePoint(complex(3)), multiplicity: 4 }]));
  assert.equal(some.kind, SURVIVAL_SOME); assert.equal(some.existsThroughDepth, true); assert.equal(some.allThroughDepth, false);
  const none = classify(() => mockFibre([{ point: finiteSpherePoint(complex(3)), multiplicity: 5 }]));
  assert.equal(none.kind, SURVIVAL_NONE);
  const failed = classify(() => mockFibre([], 'unresolved'));
  assert.equal(failed.kind, SURVIVAL_UNRESOLVED); assert.equal(failed.reason, 'solver');
  const capped = classify(() => mockFibre([{ point: finiteSpherePoint(complex(.5)), multiplicity: 5 }]), 2);
  assert.equal(capped.kind, SURVIVAL_UNRESOLVED); assert.equal(capped.reason, 'node-cap');
  const boundary = classify(() => mockFibre([{ point: finiteSpherePoint(complex(2)), multiplicity: 5 }]));
  assert.equal(boundary.kind, SURVIVAL_UNRESOLVED); assert.equal(boundary.reason, 'boundary');
});

test('orbit trees preserve edge multiplicity and make caps visible', () => {
  const view = { re: 0, im: 0, span: 4 };
  const tree = buildCorrespondenceOrbitTree({ c: .7, root: finiteSpherePoint(complex(0)), view, depth: 1 });
  assert.equal(tree.edges.reduce((sum, edge) => sum + edge.multiplicity, 0), 5);
  assert.ok(tree.nodes.some(node => node.value.kind === 'infinity' && node.status === 'escaped'));
  const capped = buildCorrespondenceOrbitTree({ c: .7, root: finiteSpherePoint({ re: 1.21, im: .37 }), view, depth: 3, nodeCap: 3 });
  assert.equal(capped.complete, false);
  assert.equal(capped.stopReason, 'node-cap');
  assert.ok(capped.nodes.some(node => node.status === 'capped'));
});

test('survival rasters report progress, chunks and reject hidden pruning', () => {
  const chunks = [], progress = [];
  const grid = renderFiniteBranchSurvivalGrid({ c: .7, view: { re: 0, im: 0, span: 4 }, size: 8, depth: 1, nodeCap: 100 }, value => progress.push(value), chunk => chunks.push(chunk));
  assert.equal(grid.kinds.length, 64);
  assert.equal(Object.values(grid.counts).slice(0, 4).reduce((sum, count) => sum + count, 0), 64);
  assert.equal(progress.at(-1), 1);
  assert.equal(chunks.reduce((sum, chunk) => sum + chunk.rowCount, 0), 8);
  assert.ok(estimateSurvivalWork(512, 6) > MAX_SURVIVAL_RASTER_WORK);
  assert.throws(() => renderFiniteBranchSurvivalGrid({ c: 0, view: { re: 0, im: 0, span: 4 }, size: 512, depth: 6 }), /work budget/);
});

test('branch matching is explicitly local and display language remains finite-depth', () => {
  const first = solveCorrespondenceFibre(finiteSpherePoint({ re: 1.2, im: .3 }), .7);
  const second = solveCorrespondenceFibre(finiteSpherePoint({ re: 1.2, im: .3 }), .70001);
  const matches = matchBranchLabels(first.images, second.images);
  assert.equal(matches.length, first.images.length);
  assert.ok(matches.every(match => match.distance < .01));
  assert.deepEqual(CORRESPONDENCE_MODE_BADGES, {
    'verified-round': 'Verified round model',
    'post-pinching': 'Pinched/post-pinched algebraic model',
    ramified: 'Ramified exploratory model',
  });
  assert.match(RAMIFIED_MODE_CAUTION, /No mating/);
  assert.match(BRANCH_TRACKING_CAUTION, /visual aid/);
  assert.match(FINITE_DEPTH_CAUTION, /finite-depth question/);
  for (const formula of [CORRESPONDENCE_FIBRE_FORMULA, CORRESPONDENCE_EXISTS_FORMULA, CORRESPONDENCE_ALL_FORMULA]) {
    const html = katex.renderToString(formula, { throwOnError: true, output: 'htmlAndMathml' });
    assert.match(html, /<math/); assert.doesNotMatch(html, /katex-error/);
  }
  const grid = { c: 0, view: { re: 0, im: 0, span: 4 }, size: 1, depth: 1, nodeCap: 5, dedupTolerance: 1e-7, kinds: Uint8Array.of(SURVIVAL_ALL), reasons: Uint8Array.of(0), counts: { all: 1, some: 0, none: 0, unresolved: 0, solverFailures: 0, capped: 0 } };
  assert.notDeepEqual(survivalColour(grid, 0, 'existential'), survivalColour(grid, 0, 'universal'));
  assert.match(describeFiniteSurvival({ kind: SURVIVAL_SOME, depth: 2, reason: 'complete', nodesVisited: 8, existsThroughDepth: true, allThroughDepth: false }), /Some, but not all/);
  assert.match(describeCorrespondenceFibre(first), /counted with multiplicity/);
});

test('the algebraic calculation still agrees with R_c at every retained inverse root', () => {
  const x = { re: .93, im: -.41 }, c = .9;
  const fibre = solveCorrespondenceFibre(finiteSpherePoint(x), c);
  const w = correspondenceR(x, c);
  for (const image of fibre.images) if (image.zeta.kind === 'finite') nearPoint(correspondenceR(image.zeta.value, c), w, 2e-7);
});
