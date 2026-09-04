import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeBlogRoute, personalWebpage, blogTitle, blogPageMetadata } from '../lib/blog-routes.ts';

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
test('the distributed application excludes personal pages and photographs', () => {
  assert.equal(existsSync(new URL('../components/personal-pages.tsx', import.meta.url)), false);
  assert.equal(existsSync(new URL('../public/profile/', import.meta.url)), false);
  const app = readFileSync(new URL('../components/site-app.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /PersonalHome|VitaPage|PersonalResearchPage|PersonalContact|PersonalPageBanner/);
  assert.match(app, /<MandelbrotJuliaExplorer/);
  assert.match(app, /<MandelbrotMotion/);
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /profile\//);
});
