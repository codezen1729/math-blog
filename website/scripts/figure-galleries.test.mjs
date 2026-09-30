import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { prepareFigureGalleries } from '../lib/figure-galleries.mjs';

const images = ['j1.webp', 'j2.webp', 'j3.webp'];
const image = (name, extra = '') => `<img src="figures/surgeries/${name}" loading="lazy" ${extra}/>`;
const rawGallery = `<figure data-latex-placement="!htb">\n${image(images[0])}\n${image(images[1])}\n<p> ${image(images[2])}</p>\n</figure>`;

test('only the intended source triptych receives equal-sized gallery panels', () => {
  const result = prepareFigureGalleries(rawGallery);
  assert.match(result, /class="figure-gallery" data-gallery="julia-examples"/);
  assert.equal((result.match(/width:100%;max-width:100%;height:auto/g) ?? []).length, 3);
  assert.equal((result.match(/<img\b/g) ?? []).length, 3);
  assert.doesNotMatch(result, /<p>/);
  assert.deepEqual([...result.matchAll(/src="([^"]+)"/g)].map(match => match[1]), images.map(name => `figures/surgeries/${name}`));
});

test('existing enlargement links, alternative text and intrinsic dimensions survive', () => {
  const panels = images.map((name, index) => `<a class="figure-zoom" href="figures/surgeries/${name}" target="_blank" rel="noreferrer" aria-label="Enlarge panel ${index}">${image(name, `width="600" height="600" alt="Panel ${index}" style="width:${index ? 600 : 435}px;max-width:100%;height:auto"`)}</a>`);
  const result = prepareFigureGalleries(`<figure id="examples" class="existing">${panels[0]}${panels[1]}<p>${panels[2]}</p></figure>`);
  assert.match(result, /id="examples" class="existing figure-gallery"/);
  assert.equal((result.match(/class="figure-zoom"/g) ?? []).length, 3);
  assert.equal((result.match(/width="600" height="600"/g) ?? []).length, 3);
  for (let index = 0; index < images.length; index++) {
    assert.ok(result.includes(`href="figures/surgeries/${images[index]}"`));
    assert.ok(result.includes(`alt="Panel ${index}"`));
    assert.ok(result.includes(`aria-label="Enlarge panel ${index}"`));
  }
  assert.doesNotMatch(result, /width:435px|width:600px/);
});

test('unrelated diagrams, reordered images and authored captions are not regrouped', () => {
  for (const source of [
    rawGallery.replaceAll('surgeries/', 'another-collection/'),
    rawGallery.replace('j1.webp', 'j0.webp'),
    `<figure>${image('j3.webp')}${image('j2.webp')}${image('j1.webp')}</figure>`,
    rawGallery.replace('</figure>', '<figcaption>Authored caption</figcaption></figure>'),
    rawGallery.replace('</figure>', '<span id="reference-target"></span></figure>'),
    rawGallery.replace('<p> ', '<p id="authored-anchor"> '),
  ]) assert.equal(prepareFigureGalleries(source), source);
});

test('gallery decoration is idempotent and works with the Pages asset prefix', () => {
  const result = prepareFigureGalleries(rawGallery.replaceAll('src="figures/', 'src="/math-blog/figures/'));
  assert.match(result, /data-gallery="julia-examples"/);
  assert.equal(prepareFigureGalleries(result), result);
});

test('both current author galleries are recognized, with every image retained', () => {
  const post = JSON.parse(fs.readFileSync(new URL('../lib/posts/classification-fatou-components.json', import.meta.url), 'utf8'));
  const result = prepareFigureGalleries(post.html);
  assert.equal((result.match(/class="figure-gallery"/g) ?? []).length, 2);
  assert.match(result, /data-gallery="julia-examples"/);
  assert.match(result, /data-gallery="multibrot-examples"/);
  assert.deepEqual([...result.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(match => match[1]),
    [...post.html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(match => match[1]));
});
