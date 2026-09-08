import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../dist-pages/', import.meta.url).pathname;
const posts = JSON.parse(readFileSync(new URL('../lib/generated-posts.json', import.meta.url), 'utf8'));
const indexPosts = JSON.parse(readFileSync(new URL('../lib/generated-post-index.json', import.meta.url), 'utf8'));
const search = JSON.parse(readFileSync(new URL('../public/search-index.json', import.meta.url), 'utf8'));
const series = ['k-theory','dynamics','surfaces-and-curves','standard-tools','commutative-algebra','ergodic-theory','lemma-book','miscellaneous'];
const page = relative => readFileSync(join(root, relative, 'index.html'), 'utf8');
const decode = value => value.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(Number.parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number.parseInt(n,10)));
const plain = value => decode(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const countTag = (value, tag) => (value.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length;

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
    for (const tag of ['p','figure','img','h2','h3','h4']) assert.equal(countTag(article, tag), countTag(post.html, tag), `${post.slug}: incomplete ${tag} structure`);
    for (const id of [...post.html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])) assert.ok(article.includes(`id="${id}"`), `${post.slug}: missing #${id}`);
  }
});

test('previews, search, feed and sitemap derive from the same article records', () => {
  assert.equal(search.length, posts.length);
  for (const post of posts) {
    const record = search.find(item => item.slug === post.slug);
    assert.ok(record?.text.length > plain(post.excerptHtml).length, post.slug);
    assert.ok(record.text.startsWith(plain(post.html).slice(0, 40)), post.slug);
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
