import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeBlogRoute, personalWebpage, blogTitle, blogPageMetadata, phaseForLegacyTrack } from '../lib/blog-routes.ts';
import { articleFigureWidth, vectorFigureMinimum } from '../lib/figure-sizing.ts';

const posts = JSON.parse(readFileSync(new URL('../lib/generated-posts.json', import.meta.url), 'utf8'));

test('the blog is the front page and old home links remain usable', () => {
  for (const hash of ['', '#', '#/', '#/home', '#home', '#/home/']) assert.equal(normalizeBlogRoute(hash), 'blog');
});
test('old archive and reading-path links preserve their topic and page', () => {
  assert.equal(normalizeBlogRoute('#/path/k-theory?page=2'), 'blog/k-theory?page=2');
  assert.equal(normalizeBlogRoute('#/archive/standard-tools'), 'blog/standard-tools');
  assert.equal(normalizeBlogRoute('#/archive/?page=3'), 'blog/?page=3');
  assert.equal(normalizeBlogRoute('#/path'), 'blog');
});
test('legacy topic names still resolve to their present series', () => {
  assert.ok(posts.some(post => post.track === 'Riemann surfaces'));
  assert.ok(posts.some(post => post.track === 'Thermodynamic formalism'));
  for (const track of ['Riemann surfaces', 'Elliptic curves', 'Abelian functions']) assert.equal(phaseForLegacyTrack(track), 2);
  for (const track of ['Complex dynamics', 'Thermodynamic formalism']) assert.equal(phaseForLegacyTrack(track), 4);
  assert.equal(phaseForLegacyTrack('The Lemma Book'), 7);
  assert.equal(phaseForLegacyTrack('unknown'), undefined);
});
test('post links, laboratory and retired academic links remain distinguishable', () => {
  for (const route of ['post/abels-theorem', 'lab', 'blog/dynamics', 'vita', 'research', 'missing']) assert.equal(normalizeBlogRoute(`#/${route}`), route);
  assert.equal(personalWebpage, 'https://sites.google.com/view/viswanathan1729/navigate');
});
test('site metadata describes the blog, not the former personal website', () => {
  const metadata = blogPageMetadata();
  assert.equal(blogTitle, 'The Iteration Café');
  assert.equal(metadata.title, blogTitle);
  assert.equal(metadata.useSiteImage, true);
  assert.match(metadata.description, /K-theory/);
  assert.doesNotMatch(metadata.description, /research|teaching|Vita/i);
});
test('source-derived post titles flow into distinct metadata without the generic site card', () => {
  assert.ok(posts.length >= 2);
  for (const {title} of [posts[0], posts.at(-1)]) {
    assert.ok(title);
    const description = `${title}. A mathematical blog post by S. Viswanathan.`;
    assert.deepEqual(blogPageMetadata(title, description, true), {title: `${title} · ${blogTitle}`, description, type: 'article', useSiteImage: false});
  }
});
test('publication order and the Olympiad series label come from the current manifest', () => {
  posts.forEach((post, index) => assert.equal(post.order, index + 1, post.slug));
  const olympiadPosts = posts.filter(post => post.phase === 7);
  assert.ok(olympiadPosts.length > 0);
  assert.ok(olympiadPosts.every(post => post.phaseLabel === 'Lemma Book (Olympiad Days)'));
});
test('every blog preview is the first readable paragraph of its post', () => {
  const candidate = paragraph => paragraph
    .replace(/<span\b[^>]*class="[^"]*\bmath display\b[^"]*"[^>]*>[\s\S]*?<\/span>/g, ' ')
    .replace(/<a\b(?=[^>]*class="[^"]*\bfootnote-ref\b[^"]*")[^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/<img\b[^>]*>/g, '');
  const readable = paragraph => {
    const text = paragraph.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const navigationParts = text.match(/\bPart\s+[IVXLCDM]+\b/gi) ?? [];
    const romanSectionLabel = /^[IVXLCDM]+\s*[.)]\s*(?:Prologue|[^.!?]{1,70}\bPerspective)\.?$/i.test(text);
    return text.length >= 8
      && /[A-Za-z]/.test(text)
      && !/^(proof|remark|note|example|definition|theorem)\.?$/i.test(text)
      && navigationParts.length < 2
      && !romanSectionLabel;
  };
  for (const post of posts) {
    const first = [...post.html.matchAll(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g)].map(match => match[0]).find(paragraph => readable(candidate(paragraph))) ?? '';
    assert.ok(first, post.slug);
    assert.equal(post.excerptHtml, first, post.slug);
  }
});
test('blog previews skip manuscript navigation and section-label furniture', () => {
  for (const slug of ['third-surgery', 'mcmullens-surgery', 'mcmullens-surgery-finite-symmetry']) {
    assert.doesNotMatch(posts.find(post => post.slug === slug).excerptHtml, /Part I[\s\S]*Part II[\s\S]*Part III/);
  }
  for (const slug of ['elliptic-curves-algebraic', 'elliptic-curves-harmonic', 'abels-theorem']) {
    assert.doesNotMatch(posts.find(post => post.slug === slug).excerptHtml, /^<p>[IVXLCDM]+\s*[.)]/);
  }
});
test('vector figures enlarge with consistent labels and drawing-specific canvas space', () => {
  const metadata = JSON.parse(readFileSync(new URL('../lib/figure-metadata.json', import.meta.url), 'utf8'));
  for (const [src, info] of Object.entries(metadata).filter(([, info]) => info.kind === 'vector')) {
    const width = articleFigureWidth(info, true, src);
    const baselineWidth = Math.round(info.displayWidth * (20.4 / (info.labelSizePx || 17)));
    assert.ok(width >= baselineWidth, src);
    assert.ok(width >= vectorFigureMinimum(src), src);
    if (!vectorFigureMinimum(src)) {
      const effectiveLabelSize = info.labelSizePx * width / info.displayWidth;
      assert.ok(effectiveLabelSize >= 20 && effectiveLabelSize <= 21, `${src}: ${effectiveLabelSize}`);
    }
  }
  for (const src of ['figures/complex-analysis/note6-fig-01.svg', 'figures/complex-analysis/note7-fig-03.svg', 'figures/quadratic-family/qf-fig-02.svg']) {
    assert.ok(vectorFigureMinimum(src) >= 300, src);
  }
});
test('the distributed application excludes personal pages and photographs', () => {
  assert.equal(existsSync(new URL('../components/personal-pages.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../public/profile/', import.meta.url)), false);
  const app = readFileSync(new URL('../components/site-app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /PersonalHome|VitaPage|PersonalResearchPage|PersonalContact|PersonalPageBanner/);
  assert.match(app, /<MandelbrotJuliaExplorer/);
  assert.match(app, /<MandelbrotMotion/);
  assert.match(app, /title: 'Lemma Book \(Olympiad Days\)'/);
  assert.match(app, /articleFigureWidth/);
  assert.match(app, /maxWidth: figureScale <= 1 \? '100%' : 'none'/);
  assert.match(app, /scrollWidth > scroller\.clientWidth/);
  assert.match(app, /mathematicalLength > 150/);
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /profile\//);
});
