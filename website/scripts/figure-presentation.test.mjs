import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { articleFigureWidth } from '../lib/figure-sizing.ts';

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  ({ default: sharp } = await import('../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'lib', 'figure-metadata.json'), 'utf8'));

test('mathematical drawings retain an eye-level minimum size', () => {
  assert.equal(articleFigureWidth({ kind: 'vector', width: 180, height: 180, displayWidth: 150, labelSizePx: 17 }, true, 'figures/example.svg'), 211);
  assert.equal(articleFigureWidth({ kind: 'vector', width: 420, height: 120, displayWidth: 300, labelSizePx: 17 }, true, 'figures/example.svg'), 423);
  assert.equal(articleFigureWidth({ kind: 'vector', width: 160, height: 330, displayWidth: 150, labelSizePx: 17 }, true, 'figures/example.svg'), 211);
  assert.equal(articleFigureWidth({ kind: 'raster', width: 487, height: 487, displayWidth: 244 }, false, 'figures/example.webp'), 420);
});

test('every published SVG uses a tight, dimensionally consistent canvas', () => {
  const vectors = Object.entries(metadata).filter(([, info]) => info.kind === 'vector');
  assert.ok(vectors.length > 300);
  for (const [name, info] of vectors) {
    const source = fs.readFileSync(path.join(root, 'public', name), 'utf8');
    assert.match(source, /data-blog-tightened="1"/, name);
    const viewBox = source.match(/\bviewBox=(['"])(.*?)\1/i)?.[2].trim().split(/[ ,]+/).map(Number);
    assert.equal(viewBox?.length, 4, name);
    assert.equal(info.width, Math.round(viewBox[2] * 96 / 72), name);
    assert.equal(info.height, Math.round(viewBox[3] * 96 / 72), name);
  }
});

test('published raster dimensions and formats match their metadata', async () => {
  const rasters = Object.entries(metadata).filter(([, info]) => info.kind === 'raster');
  assert.ok(rasters.length >= 20);
  for (const [name, info] of rasters) {
    const image = await sharp(path.join(root, 'public', name)).metadata();
    assert.equal(image.width, info.width, name);
    assert.equal(image.height, info.height, name);
    if (name.endsWith('.webp')) assert.equal(image.format, 'webp', name);
  }
});
