import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAPER_LIBRARY } from '../lib/paper-library.ts';

const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));

test('registered papers have unambiguous versioned identities and source destinations', () => {
  assert.ok(PAPER_LIBRARY.length > 0);
  assert.equal(new Set(PAPER_LIBRARY.map(paper => paper.id)).size, PAPER_LIBRARY.length);
  for (const { id, corpus } of PAPER_LIBRARY) {
    assert.equal(id, `${corpus.paper.arxiv_id}${corpus.paper.version}`);
    assert.ok(corpus.paper.title.trim() && corpus.paper.authors.length);
    assert.equal(new Set(corpus.chunks.map(chunk => chunk.id)).size, corpus.chunks.length);
    for (const item of [...corpus.chunks, ...corpus.statements]) {
      const page = item.page_start;
      assert.ok(Number.isInteger(page) && page >= 1 && page <= corpus.paper.page_count);
      const expected = new URL(corpus.paper.pdf_url); expected.hash = `page=${page}`;
      assert.equal(item.source_url, expected.href);
    }
  }
});

test('precise statements and proofs retain full source text and valid starting-page links', () => {
  for (const { corpus } of PAPER_LIBRARY) {
    assert.equal(new Set(corpus.statements.map(item => item.id)).size, corpus.statements.length);
    const statements = new Set(corpus.statements.map(item => item.id));
    for (const item of [...corpus.statements, ...(corpus.proofs ?? [])]) {
      assert.ok(item.text?.trim(), item.id);
      assert.ok(Number.isInteger(item.start_page) && item.start_page >= 1 && item.start_page <= corpus.paper.page_count, item.id);
      const expected = new URL(corpus.paper.pdf_url); expected.hash = `page=${item.start_page}`;
      assert.equal(item.start_source_url, expected.href);
      if ('statement_id' in item) assert.ok(statements.has(item.statement_id), item.id);
    }
  }
});

test('every gallery image is the unchanged reviewed figure, with accessible text and exact PDF page', () => {
  for (const { id, corpus } of PAPER_LIBRARY) {
    assert.equal(corpus.figures.length, corpus.paper.figure_count);
    assert.equal(new Set(corpus.figures.map(figure => figure.number)).size, corpus.figures.length);
    for (const figure of corpus.figures) {
      assert.ok(figure.asset_path.startsWith(`/papers/${id}/`));
      const path = resolve(publicRoot, figure.asset_path.replace(/^\/+/, ''));
      assert.ok(!relative(publicRoot, path).startsWith('..'));
      const bytes = readFileSync(path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), figure.sha256);
      assert.ok(figure.alt.length >= 20 && figure.caption.length >= 20);
      assert.ok(figure.width > 0 && figure.height > 0);
      assert.ok(Number.isInteger(figure.page) && figure.page >= 1 && figure.page <= corpus.paper.page_count);
      const expected = new URL(corpus.paper.pdf_url); expected.hash = `page=${figure.page}`;
      assert.equal(figure.source_url, expected.href);
    }
  }
});
