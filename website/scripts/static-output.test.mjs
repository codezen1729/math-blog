import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { articleFigureWidth } from '../lib/figure-sizing.ts';
import { prepareFigureGalleries } from '../lib/figure-galleries.mjs';

const root = new URL('../dist-pages/', import.meta.url).pathname;
const posts = JSON.parse(readFileSync(new URL('../lib/generated-posts.json', import.meta.url), 'utf8'));
const indexPosts = JSON.parse(readFileSync(new URL('../lib/generated-post-index.json', import.meta.url), 'utf8'));
const search = JSON.parse(readFileSync(new URL('../public/search-index.json', import.meta.url), 'utf8'));
const figureDescriptions = JSON.parse(readFileSync(new URL('../lib/figure-descriptions.json', import.meta.url), 'utf8'));
const figureMetadata = JSON.parse(readFileSync(new URL('../lib/figure-metadata.json', import.meta.url), 'utf8'));
const series = ['k-theory','dynamics','surfaces-and-curves','standard-tools','commutative-algebra','ergodic-theory','lemma-book','miscellaneous'];
const page = relative => readFileSync(join(root, relative, 'index.html'), 'utf8');
const decode = value => value.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(Number.parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number.parseInt(n,10)));
const plain = value => decode(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const countTag = (value, tag) => (value.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length;
const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1];

test('every static article image uses the same dimensions and scroll wrappers as the interactive article', () => {
  let total=0;
  let vectors=0;
  for(const post of posts){
    const article=page(`post/${post.slug}`).match(/<div class="article-prose">([\s\S]*?)<\/div><\/div><nav class="article-next-prev"/)?.[1];
    assert.ok(article,post.slug);
    const originals=[...post.html.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0]);
    const rendered=[...article.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0]);
    assert.equal(rendered.length,originals.length,post.slug);
    const scrollers=[...article.matchAll(/<span class="figure-scroll"[^>]*><a class="figure-zoom"[^>]*>(<img\b[^>]*>)<\/a><\/span>/g)].map(match=>decode(attribute(match[1],'src')));
    const gallerySources=new Set([...article.matchAll(/<figure\b[^>]*data-gallery="(?:julia-examples|multibrot-examples)"[^>]*>([\s\S]*?)<\/figure>/g)].flatMap(match=>[...match[1].matchAll(/<img\b[^>]*>/g)].map(image=>decode(attribute(image[0],'src')))));
    const expectedScrollers=[];
    for(let index=0;index<originals.length;index++){
      const src=decode(attribute(originals[index],'src'));
      const image=rendered[index];
      const info=figureMetadata[src];
      assert.ok(info,`${post.slug}: no metadata for ${src}`);
      const vector=info.kind==='vector'||src.endsWith('.svg');
      assert.equal(decode(attribute(image,'src')),src,`${post.slug}: changed figure ordering`);
      assert.equal(Number(attribute(image,'width')),Math.round(info.width),src);
      assert.equal(Number(attribute(image,'height')),Math.round(info.height),src);
      assert.equal(attribute(image,'style'),gallerySources.has(src)?'width:100%;max-width:100%;height:auto':`width:${articleFigureWidth(info,vector,src)}px;max-width:${vector?'none':'100%'};height:auto`,src);
      assert.equal((image.match(/\s(?:width|height|style)=/gi)||[]).length,3,`${src}: duplicate dimensions`);
      assert.doesNotMatch(image,/\s\/\s+\w+=/,`${src}: attributes appended after a self-closing slash`);
      const authoredAlt=attribute(originals[index],'alt');
      if(authoredAlt!==undefined&&!/^(?:image|figure)$/i.test(decode(authoredAlt).trim())){
        assert.equal(decode(attribute(image,'alt')),decode(authoredAlt),`${src}: authored alternative text was overwritten`);
      }
      if(vector){expectedScrollers.push(src);vectors++;}
      total++;
    }
    assert.deepEqual(scrollers,expectedScrollers,`${post.slug}: missing or unexpected scroll wrappers`);
    assert.equal((article.match(/class="figure-zoom"/g)||[]).length,originals.length,`${post.slug}: every figure must have an enlargement link`);
  }
  assert.ok(total>300,'the full figure collection was checked');
  assert.ok(vectors>250,'all SVG placements were checked');
});

test('figure spacing stays centered on phones without compounding image margins', () => {
  const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.match(css,/\.article-prose \.figure-scroll img\s*\{[^}]*margin:\s*0\s*;/);
  assert.match(css,/\.article-prose \.figure-scroll \.figure-zoom\s*\{[^}]*margin-inline:\s*auto\s*;/);
  assert.doesNotMatch(css,/\.article-prose \.figure-scroll \.figure-zoom\s*\{[^}]*margin-inline:\s*0\s*;/);
  assert.match(css,/\.article-prose \.figure-scroll\s*\{[^}]*overflow-x:\s*auto\s*;/);
});

test('every post and series has a real static path with canonical metadata', () => {
  assert.equal(indexPosts.length, posts.length);
  assert.ok(indexPosts.every(post => !Object.hasOwn(post, 'html') && !Object.hasOwn(post, 'mathMacros')));
  for (const slug of series) {
    const html = page(`series/${slug}`);
    assert.match(html, /<meta name="blog-route" content="blog\//);
    assert.match(html, /<link rel="canonical" href="https:\/\/codezen1729\.github\.io\/math-blog\/series\//);
  }
  for (const post of posts) {
    const html = page(`post/${post.slug}`);
    assert.match(html, new RegExp(`<h1>${post.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}</h1>`));
    assert.match(html, /<meta name="blog-route" content="post\//);
    assert.match(html, /<link rel="canonical" href="https:\/\/codezen1729\.github\.io\/math-blog\/post\//);
    assert.equal((html.match(/<link rel="canonical"/g) ?? []).length, 1, post.slug);
    assert.equal((html.match(/<meta property="og:url"/g) ?? []).length, 1, post.slug);
    assert.match(html, new RegExp(`<meta property="og:title" content="${post.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} · The Iteration Café"`));
    assert.match(html, /<meta property="og:type" content="article"/);
    const article = html.match(/<div class="article-prose">([\s\S]*?)<\/div><\/div><nav class="article-next-prev"/)?.[1];
    assert.ok(article, `${post.slug}: static article body is missing`);
    // Known triptychs discard only image-only paragraph wrappers, not prose.
    const presentationSource=prepareFigureGalleries(post.html);
    for (const tag of ['p','figure','img','h2','h3','h4']) assert.equal(countTag(article, tag), countTag(presentationSource, tag), `${post.slug}: incomplete ${tag} structure`);
    for (const id of [...post.html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])) assert.ok(article.includes(`id="${id}"`), `${post.slug}: missing #${id}`);
  }
});

test('previews, search, feed and sitemap derive from the same article records', () => {
  assert.equal(search.length, posts.length);
  for (const post of posts) {
    const record = search.find(item => item.slug === post.slug);
    assert.ok(record?.text.length > plain(post.excerptHtml).length, post.slug);
    assert.ok(record.text.startsWith(plain(post.html).slice(0, 40)), post.slug);
    const expectedDescriptions = [...new Set([...post.html.matchAll(/<img\b[^>]*src="([^"]+)"/gi)]
      .map(match => figureDescriptions[decode(match[1])]).filter(Boolean))];
    assert.deepEqual(record.figureDescriptions, expectedDescriptions, `${post.slug}: figure descriptions missing from search`);
    for (const description of expectedDescriptions) assert.ok(record.text.includes(description), `${post.slug}: description is not searchable`);
  }
  const feed = readFileSync(join(root, 'rss.xml'), 'utf8');
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  assert.equal((feed.match(/<item>/g) ?? []).length, posts.length);
  const paginationCount = Math.max(0, Math.ceil(posts.length / 6) - 1) + series.reduce((sum, slug) => {
    const phase = posts.find(post => post.phaseLabel && ({'k-theory':3,'dynamics':4,'surfaces-and-curves':2,'standard-tools':1,'commutative-algebra':5,'ergodic-theory':6,'lemma-book':7,'miscellaneous':8})[slug] === post.phase)?.phase;
    return sum + Math.max(0, Math.ceil(posts.filter(post => post.phase === phase).length / 6) - 1);
  }, 0);
  assert.equal((sitemap.match(/<url>/g) ?? []).length, posts.length + series.length + 3 + paginationCount);
  assert.doesNotMatch(feed, /<pubDate>/);
  assert.doesNotMatch(sitemap, /<lastmod>/);
  assert.ok(existsSync(join(root, 'robots.txt')));
});

test('static articles have accessible structure and contextual image descriptions', () => {
  for (const post of posts) {
    const html = page(`post/${post.slug}`);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, post.slug);
    assert.match(html, /class="skip-link" href="post\/[^"#]+\/#main-content"/);
    assert.match(html, /<details class="article-toc">/);
    const levels = [...html.matchAll(/<h([1-4])\b/g)].map(match => Number(match[1]));
    for (let index = 1; index < levels.length; index++) assert.ok(levels[index] <= levels[index-1] + 1, `${post.slug}: skipped h${levels[index-1]} to h${levels[index]}`);
    for (const image of html.matchAll(/<img\b[^>]*alt="([^"]*)"[^>]*>/g)) {
      assert.ok(image[1].trim().length > 12, post.slug);
      assert.doesNotMatch(image[1], /^(?:image|figure)(?:\s+\d+)?$/i, post.slug);
    }
  }
});

test('sidebar disclosures keep Topics, this series, and recommendations in the requested order', () => {
  for (const slug of series) {
    const html = page(`series/${slug}`);
    assert.ok(html.indexOf('<h2>Topics</h2>') < html.indexOf('<h2>In this series</h2>'), slug);
    assert.ok(html.indexOf('<h2>In this series</h2>') < html.indexOf('<h2>Blog Recommendations</h2>'), slug);
    assert.match(html, /<details class="journal-disclosure journal-series" open><summary><h2>In this series<\/h2><\/summary>/);
    assert.match(html, /<details class="journal-disclosure" open><summary><h2>Blog Recommendations<\/h2><\/summary>/);
  }
});

test('local section, footnote and skip links resolve to the current document despite its base URL', () => {
  for (const relative of ['', 'blog', ...series.map(slug => `series/${slug}`), ...posts.map(post => `post/${post.slug}`)]) {
    const html = page(relative);
    assert.doesNotMatch(html, /href="#(?!\/)/, relative || 'home');
    const documentUrl = new URL(relative ? `${relative}/` : './', 'https://codezen1729.github.io/math-blog/');
    const baseUrl = new URL(html.match(/<base href="([^"]+)"/)[1], documentUrl);
    const skip = html.match(/class="skip-link" href="([^"]+)"/)[1];
    assert.equal(new URL(skip, baseUrl).pathname, documentUrl.pathname);
    for (const section of html.matchAll(/<details class="article-toc">([\s\S]*?)<\/details>/g)) {
      for (const link of section[1].matchAll(/href="([^"]+)"/g)) {
        const destination = new URL(link[1], baseUrl);
        assert.equal(destination.pathname, documentUrl.pathname, `${relative}: ${link[1]}`);
        assert.ok(html.includes(`id="${decodeURIComponent(destination.hash.slice(1))}"`), `${relative}: missing section`);
      }
    }
  }
});

test('article bodies and Laboratory code are split away from the index bundle', () => {
  const assets = readdirSync(join(root, 'assets')).filter(name => name.endsWith('.js'));
  const main = assets.find(name => name.startsWith('index-'));
  assert.ok(main);
  const source = readFileSync(join(root, 'assets', main), 'utf8');
  assert.doesNotMatch(source, /A Family of Correspondences/);
  const indexPayload = JSON.stringify(indexPosts);
  const deepPhrase = posts.flatMap(post => [...post.html.slice(Math.floor(post.html.length * .55)).matchAll(/[A-Za-z][A-Za-z ,.;:'’–—-]{75,}/g)].map(match => match[0].trim())).find(phrase => phrase.length >= 75 && !indexPayload.includes(phrase));
  assert.ok(deepPhrase, 'a body-only phrase is available for the split check');
  assert.ok(!source.includes(deepPhrase), 'a complete article body leaked into the index JavaScript');
  assert.ok(statSync(join(root, 'assets', main)).size < 900_000, 'index JavaScript exceeds the review budget');
  assert.ok(assets.some(name => name.includes('lab-page')));
});

test('legacy hashes are redirected by every static shell', () => {
  for (const html of [page(''), page('blog'), page(`post/${posts[0].slug}`)]) {
    assert.match(html, /location\.hash\.startsWith\('#\/'\)/);
    assert.match(html, /location\.replace/);
    assert.match(html, /page\+='\/page\/'\+number/);
    assert.match(html, /tracks\[track\.toLowerCase\(\)\.trim\(\)\]/);
  }
});

test('Math Chatbox and its AI and paper assets are absent from the public build', () => {
  const removed = /Math Chatbox|PaperChatbox|paper-chat(?:box|\.worker)?|paper-corpus|paper-library|@mlc-ai\/web-llm/i;
  assert.doesNotMatch(page('lab'), removed);
  for (const file of readdirSync(join(root, 'assets')).filter(name => /\.(?:js|css)$/.test(name))) {
    assert.doesNotMatch(file, removed);
    assert.doesNotMatch(readFileSync(join(root, 'assets', file), 'utf8'), removed, file);
  }
  assert.ok(!existsSync(join(root, 'papers', '2508.18711v1')), 'chat-only paper gallery must not be shipped');
});

test('CSS generation uses explicit application sources in both local and packaged builds', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /@import 'tailwindcss' source\(none\);/);
  for (const path of ['./', '../components', '../pages', '../lib/*.ts', '../index.html', '../scripts/generate-static-pages.mjs']) {
    assert.ok(css.includes(`@source '${path}';`), path);
  }
  assert.doesNotMatch(css, /@source ['"]\.\.\/['"]/);
});
