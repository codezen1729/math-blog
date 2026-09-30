import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const posts = JSON.parse(readFileSync(new URL('../lib/generated-posts.json', import.meta.url)));
const bySlug = new Map(posts.map(post => [post.slug,post]));
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
const ids = new Map(posts.map(post => [post.slug, [...post.html.matchAll(/\bid="([^"]+)"/g)].map(match => decode(match[1]))]));

test('every rendered reference target is unique within its post', () => {
  for (const [slug, values] of ids) assert.equal(new Set(values).size,values.length,slug);
  for (const post of posts) assert.doesNotMatch(post.html,/BLOGANCHOR[A-Z0-9]+END/,post.slug);
});

test('citations, footnotes and cross-post theorem links reach existing targets', () => {
  let targeted = 0;
  for (const post of posts) for (const match of post.html.matchAll(/href="([^"]+)"/g)) {
    const href = decode(match[1]);
    if (!href.startsWith('#/post/')) continue;
    const [slug, query] = href.slice('#/post/'.length).split('?');
    assert.ok(bySlug.has(slug), `${post.slug}: ${href}`);
    const target = new URLSearchParams(query).get('ref');
    if (target) { targeted++; assert.ok(ids.get(slug).includes(target), `${post.slug}: ${href}`); }
  }
  assert.ok(targeted > 100, 'The restored corpus must retain its reference links.');
});

test('bibliographic citations contain clickable links and entries link to sources', () => {
  let citations = 0;
  for (const post of posts) {
    for (const match of post.html.matchAll(/<span class="citation"[^>]*>([\s\S]*?)<\/span>/g)) {
      citations++; assert.match(match[1], /<a\b[^>]*href="#\/post\/[^\"]+\?ref=ref-/,post.slug);
    }
    for (const match of post.html.matchAll(/<div id="ref-[^"]+" class="csl-entry"[^>]*>([\s\S]*?)<\/div>/g)) {
      assert.match(match[1], /href="https:\/\//,post.slug);
    }
  }
  assert.ok(citations >= 50);
});

test('posts have internal section headings below the page title', () => {
  for (const post of posts) {
    assert.doesNotMatch(post.html, /<h1\b/,post.slug);
    const levels=[...post.html.matchAll(/<h([2-5])\b/g)].map(match=>Number(match[1]));
    if(levels.length) assert.equal(levels[0],2,`${post.slug}: first content heading`);
    for(let index=1;index<levels.length;index++) assert.ok(levels[index]<=levels[index-1]+1,`${post.slug}: skipped h${levels[index-1]} to h${levels[index]}`);
  }
});

test('full newest collections retain their closing sections and all source figures', () => {
  const expected = {'the-quadratic-family':7, 'conformal-welding':1, 'smooth-covering-manifolds':9};
  for (const [slug,count] of Object.entries(expected)) assert.equal([...bySlug.get(slug).html.matchAll(/<img\b/g)].length,count,slug);
  const surgeryFigureCounts = {
    'third-surgery': 17,
    'mcmullens-surgery': 25,
    'mcmullens-surgery-finite-symmetry': 0,
  };
  for (const [slug,count] of Object.entries(surgeryFigureCounts)) {
    const sourceFigures = [...bySlug.get(slug).html.matchAll(/src="figures\/mcmullens-surgery\/ms-fig-[^"]+\.svg"/g)];
    assert.equal(sourceFigures.length,count,slug);
  }
  const surgeryFigures = new Set(
    ['third-surgery','mcmullens-surgery','mcmullens-surgery-finite-symmetry']
      .flatMap(slug => [...bySlug.get(slug).html.matchAll(/src="(figures\/mcmullens-surgery\/ms-fig-[^"]+\.svg)"/g)].map(match => match[1]))
  );
  assert.equal(surgeryFigures.size,42,'McMullen surgery external-figure distribution');
  const rigidModels = bySlug.get('mcmullens-surgery').html;
  assert.match(rigidModels, /ms-fig-30\.svg[\s\S]*ms-fig-31\.svg[\s\S]*ms-fig-32\.svg/, 'The auxiliary Julia schematic belongs beside the original Zoretti argument.');
  const bloch = bySlug.get('rouche-and-bloch').html;
  assert.ok(bloch.indexOf('note7-fig-05.svg') < bloch.indexOf('Final remark'), 'Bloch disks precede the unrelated final remark.');
  const separation = bySlug.get('separation-and-holomorphic-lifting').html;
  assert.ok(separation.indexOf('note8-fig-03.svg') < separation.indexOf('note8-fig-02.svg'), 'The branch-cut figure precedes the later covering-space illustration.');
  assert.match(bySlug.get('smooth-covering-manifolds').html,/associativ/i);
  assert.ok(bySlug.get('the-quadratic-family').html.includes('G_c(P_c(z))=2G_c(z)'), 'The Quadratic Family must retain the functional equation from its final section.');
  const straightening = bySlug.get('polynomial-like-maps-and-the-straightening-theorem').html;
  assert.ok(straightening.includes('P:=\\phi\\circ F\\circ\\phi^{-1}'));
  assert.match(straightening, /Thus [\s\S]{0,240}hybrid equivalent\./);
});

test('vector diagrams keep a readable native display scale', () => {
  const metadata = JSON.parse(readFileSync(new URL('../lib/figure-metadata.json', import.meta.url)));
  for (const post of posts) for (const match of post.html.matchAll(/src="([^"]+\.svg)"/g)) {
    const info = metadata[decode(match[1])];
    assert.ok(info?.displayWidth > 0, match[1]);
    assert.equal(info.labelSizePx,17,match[1]);
  }
});
