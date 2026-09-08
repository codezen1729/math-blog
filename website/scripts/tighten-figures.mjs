import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  // The existing local install predates sharp becoming a direct dependency.
  // A clean install takes the ordinary branch above.
  ({ default: sharp } = await import('../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const figureRoot = path.join(root, 'public', 'figures');
const metadataPath = path.join(root, 'lib', 'figure-metadata.json');
const checkOnly = process.argv.includes('--check');
const marker = 'data-blog-tightened="1"';
const paddingPoints = 6;

async function walk(directory, accepts) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target, accepts));
    else if (entry.isFile() && accepts(entry.name)) files.push(target);
  }
  return files.sort();
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=(['"])(.*?)\\1`, 'i'))?.[2];
}

function replaceAttribute(tag, name, value) {
  const pattern = new RegExp(`\\b${name}=(['"])(.*?)\\1`, 'i');
  if (pattern.test(tag)) return tag.replace(pattern, `${name}="${value}"`);
  return tag.replace(/>$/, ` ${name}="${value}">`);
}

function number(value) {
  return Number.parseFloat(value).toFixed(6).replace(/\.?0+$/, '');
}

function rootInformation(source, filename) {
  const match = source.match(/<svg\b[^>]*>/i);
  if (!match) throw new Error(`${filename}: missing SVG root`);
  const values = attribute(match[0], 'viewBox')?.trim().split(/[ ,]+/).map(Number);
  if (!values || values.length !== 4 || values.some(value => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) {
    throw new Error(`${filename}: invalid viewBox`);
  }
  return { match, values };
}

async function visibleBounds(source, filename) {
  const { data, info } = await sharp(Buffer.from(source), { density: 192 })
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = info.channels - 1;
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + alpha] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error(`${filename}: no visible drawing found`);
  return { left, top, right: right + 1, bottom: bottom + 1, width: info.width, height: info.height };
}

function cropViewBox(viewBox, bounds) {
  const [x, y, width, height] = viewBox;
  const left = Math.max(x, x + width * bounds.left / bounds.width - paddingPoints);
  const top = Math.max(y, y + height * bounds.top / bounds.height - paddingPoints);
  const right = Math.min(x + width, x + width * bounds.right / bounds.width + paddingPoints);
  const bottom = Math.min(y + height, y + height * bounds.bottom / bounds.height + paddingPoints);
  return [left, top, right - left, bottom - top];
}

const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
const stale = [];
let tightened = 0;

for (const filename of await walk(figureRoot, name => name.endsWith('.svg'))) {
  const relative = path.relative(path.join(root, 'public'), filename).split(path.sep).join('/');
  const original = await fs.readFile(filename, 'utf8');
  const { match, values: originalViewBox } = rootInformation(original, relative);
  let source = original;
  let viewBox = originalViewBox;
  let displayWidth = metadata[relative]?.displayWidth ?? Math.round(originalViewBox[2] * 96 / 72 * 1.28);

  if (!match[0].includes(marker)) {
    const bounds = await visibleBounds(original, relative);
    viewBox = cropViewBox(originalViewBox, bounds);
    let rootTag = match[0];
    rootTag = replaceAttribute(rootTag, 'viewBox', viewBox.map(number).join(' '));
    rootTag = replaceAttribute(rootTag, 'width', `${number(viewBox[2])}pt`);
    rootTag = replaceAttribute(rootTag, 'height', `${number(viewBox[3])}pt`);
    rootTag = rootTag.replace(/>$/, ` ${marker}>`);
    source = original.slice(0, match.index) + rootTag + original.slice(match.index + match[0].length);
    displayWidth = Math.max(1, Math.round(displayWidth * viewBox[2] / originalViewBox[2]));
    tightened++;
  }

  const finalRoot = rootInformation(source, relative).values;
  const nextMetadata = {
    ...metadata[relative],
    kind: 'vector',
    width: Math.round(finalRoot[2] * 96 / 72),
    height: Math.round(finalRoot[3] * 96 / 72),
    displayWidth,
    labelSizePx: metadata[relative]?.labelSizePx ?? 17,
  };
  if (source !== original || JSON.stringify(metadata[relative]) !== JSON.stringify(nextMetadata)) {
    stale.push(relative);
    if (!checkOnly) {
      await fs.writeFile(filename, source);
      metadata[relative] = nextMetadata;
    }
  }
}

const rasterPadding = 12;
let trimmedRasters = 0;
for (const filename of await walk(figureRoot, name => /\.(?:webp|png|jpe?g)$/i.test(name))) {
  const relative = path.relative(path.join(root, 'public'), filename).split(path.sep).join('/');
  const before = await sharp(filename).metadata();
  if (!before.width || !before.height) throw new Error(`${relative}: missing raster dimensions`);
  const { data: content, info: contentInfo } = await sharp(filename)
    .trim({ background: '#fff', threshold: 10 })
    .toBuffer({ resolveWithObject: true });
  const hasExcessMargin = (
    before.width > contentInfo.width + rasterPadding * 2 + 2
    || before.height > contentInfo.height + rasterPadding * 2 + 2
  );
  const needsFormatNormalization = relative.endsWith('.webp') && before.format !== 'webp';
  let width = before.width;
  let height = before.height;
  let replacement = null;

  if (hasExcessMargin) {
    replacement = await sharp(content)
      .extend({
        top: rasterPadding,
        right: rasterPadding,
        bottom: rasterPadding,
        left: rasterPadding,
        background: '#fff',
      })
      .webp({ lossless: true })
      .toBuffer();
    const next = await sharp(replacement).metadata();
    width = next.width;
    height = next.height;
    trimmedRasters++;
  } else if (needsFormatNormalization) {
    replacement = await sharp(filename).webp({ lossless: true }).toBuffer();
  }

  const nextMetadata = {
    ...metadata[relative],
    kind: 'raster',
    width,
    height,
  };
  const metadataChanged = JSON.stringify(metadata[relative]) !== JSON.stringify(nextMetadata);
  if (hasExcessMargin || needsFormatNormalization || metadataChanged) {
    stale.push(relative);
    if (!checkOnly) {
      if (replacement) await fs.writeFile(filename, replacement);
      metadata[relative] = nextMetadata;
    }
  }
}

const serializedMetadata = `${JSON.stringify(metadata, null, 2)}\n`;
if (serializedMetadata !== await fs.readFile(metadataPath, 'utf8')) {
  stale.push(path.relative(root, metadataPath));
  if (!checkOnly) await fs.writeFile(metadataPath, serializedMetadata);
}

if (checkOnly && stale.length) {
  console.error(`Figure presentation is stale: ${[...new Set(stale)].join(', ')}`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log('All figures have current tight canvases and metadata.');
} else {
  console.log(`Tightened ${tightened} new vector canvases and ${trimmedRasters} raster canvases; checked ${Object.keys(metadata).length} figure records.`);
}
