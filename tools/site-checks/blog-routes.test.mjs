import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeBlogRoute, personalWebpage, blogTitle, blogPageMetadata, phaseForLegacyTrack } from '../lib/blog-routes.ts';
import { articleFigureWidth, vectorFigureMinimum } from '../lib/figure-sizing.ts';

const posts = JSON.parse(readFileSync(new URL('../lib/generated-posts.json', import.meta.url), 'utf8'));
const htmlTokens = value => [...value.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)]
  .map(match => match[0])
  .filter(token => token.startsWith('<') || token.trim());

function assertOpeningPrefix(post) {
  const article = htmlTokens(post.html);
  const preview = htmlTokens(post.excerptHtml);
  let cursor = 0;
  while (cursor < preview.length && preview[cursor] === article[cursor]) cursor++;
  assert.ok(
    cursor === preview.length || preview.slice(cursor).every(token => /^<\/[a-z][^>]*>$/i.test(token)),
    `${post.slug} preview omits or reorders material from the article opening`,
  );
}

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
  assert.equal(normalizeBlogRoute('#/recommendations'), 'blog');
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
  const thermodynamicFormalism = posts.find(post => post.slug === 'thermodynamical-formalism-hausdorff-dimension');
  assert.equal(thermodynamicFormalism.phase, 6);
  assert.equal(thermodynamicFormalism.phaseLabel, 'Ergodic Theory');
});
test('every blog preview is a gap-free prefix with at least three readable paragraphs', () => {
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
    const allParagraphs = [...post.html.matchAll(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g)].map(match => match[0]);
    const previewParagraphs = [...post.excerptHtml.matchAll(/<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g)].map(match => match[0]);
    const genuine = allParagraphs.filter(paragraph => readable(candidate(paragraph)));
    const previewGenuine = previewParagraphs.filter(paragraph => readable(candidate(paragraph)));
    assert.ok(genuine.length >= 3, post.slug);
    assert.ok(previewGenuine.length >= 3, post.slug);
    assert.equal(previewGenuine[0], genuine[0], post.slug);
    assertOpeningPrefix(post);
  }
});
test('blog previews retain opening headings, labels, navigation, formulas and figures', () => {
  for (const slug of ['third-surgery', 'mcmullens-surgery', 'mcmullens-surgery-finite-symmetry']) {
    assert.match(posts.find(post => post.slug === slug).excerptHtml, /Part I[\s\S]*Part II[\s\S]*Part III/);
  }
  for (const slug of ['elliptic-curves-algebraic', 'elliptic-curves-harmonic', 'abels-theorem']) {
    assert.match(posts.find(post => post.slug === slug).excerptHtml, /^<p>(?:<[^>]+>)*[IVXLCDM]+\s*[.)]/);
  }
  for (const slug of ['liouville-and-morera', 'elliptic-curves-geometric', 'locally-trivial-bundles']) {
    assert.match(posts.find(post => post.slug === slug).excerptHtml, /<(?:ul|ol)(?:\s[^>]*)?>/);
  }
  const connectedness = posts.find(post => post.slug === 'connectedness-and-compactness').excerptHtml;
  assert.match(connectedness, /^<h3[^>]*>Tool 2 — Real-Part Formula for the Modulus<\/h3>/);
  assert.match(connectedness, /\\\[\|z\|=\\sup_\{\\theta\}\\operatorname\{Re\}/);
  assert.match(connectedness, /src="figures\/complex-analysis\/note1-fig-01\.svg"/);
});
test('the blog sidebar retains every supplied recommendation', () => {
  const app = readFileSync(new URL('../components/site-app.tsx', import.meta.url), 'utf8');
  const urls = [
    'https://sketchesoftopology.wordpress.com/', 'https://lamington.wordpress.com/',
    'https://golem.ph.utexas.edu/category/', 'https://terrytao.wordpress.com/',
    'https://gowers.wordpress.com/', 'https://johncarlosbaez.wordpress.com/',
    'https://witheredstumps.wordpress.com/', 'https://sebastianraschka.com/',
    'https://karpathy.github.io/', 'https://lilianweng.github.io/',
    'https://proofsandprompts.com/', 'https://gilkalai.wordpress.com/',
    'https://ldtopology.wordpress.com/', 'https://mathscholar.org/',
    'https://matthewkahle.wordpress.com/page/2/',
  ];
  assert.match(app, /<h2>Blog Recommendations<\/h2><ul className="journal-topics journal-blogroll">/);
  assert.doesNotMatch(app, /href="#\/recommendations"/);
  assert.ok(app.indexOf('<h2>Topics</h2>') < app.indexOf('<h2>In this series</h2>'));
  assert.ok(app.indexOf('<h2>In this series</h2>') < app.indexOf('<h2>Blog Recommendations</h2>'));
  for (const url of urls) assert.match(app, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
  assert.doesNotMatch(app, /excerpt-equation-ellipsis|mathematicalLength/);
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /profile\//);
});
