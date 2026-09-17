/**
 * The explicit, versioned registry of reviewed Paper2Agent source packages.
 * Adding a paper means adding its reviewed corpus here, never inventing papers
 * in a model prompt. This module is lazy-loaded by the chatbox.
 */
import corpusData from './paper-corpus.json' with { type: 'json' };
import { buildPaperMessages, namedReferences, readableTex, searchPaper, sourceForHit,
  type PaperCorpus, type PaperMessage, type SearchHit } from './paper-chat.ts';

export interface PaperLibraryEntry { id: string; corpus: PaperCorpus }
export interface LibrarySearchHit extends SearchHit { paperId: string; corpus: PaperCorpus }
export interface LibrarySearchOptions { paperId?: string; limit?: number; refinedTerms?: string[] }
export const DEFAULT_PAPER_ID = '2508.18711v1';
export const PAPER_LIBRARY: PaperLibraryEntry[] = [{ id: DEFAULT_PAPER_ID, corpus: corpusData as PaperCorpus }];

export function getPaper(id: string): PaperLibraryEntry | undefined {
  return PAPER_LIBRARY.find((entry) => entry.id === id);
}

function scope(paperId?: string, library = PAPER_LIBRARY): PaperLibraryEntry[] {
  return !paperId || paperId === 'all' ? library : library.filter((entry) => entry.id === paperId);
}

/** Exact corpus phrases: the model selects from this catalog, never new labels. */
export function getSearchConcepts(paperId?: string, library = PAPER_LIBRARY): string[] {
  const phrases: string[] = [];
  for (const { corpus } of scope(paperId, library)) {
    phrases.push(...corpus.sections.map((section) => readableTex(section.title, corpus)));
    for (const chunk of corpus.chunks) {
      if (chunk.section_id === 'references') continue;
      for (const match of chunk.text.matchAll(/\\(?:textbf|emph)\{([^{}]{3,100})\}/g)) {
        const phrase = readableTex(match[1], corpus).trim();
        if (/^[\p{L}\p{N}\s‐‑–—,()'-]+$/u.test(phrase)) phrases.push(phrase);
      }
    }
  }
  return [...new Set(phrases.map((phrase) => phrase.replace(/\s+/g, ' ').trim()))]
    .filter((phrase) => phrase.length >= 5 && phrase.length <= 110 &&
      !/^(?:abstract|introduction|references|acknowledgments|overview|proof|appendix)$/i.test(phrase))
    .slice(0, 120);
}

function identity(hit: LibrarySearchHit): string {
  return `${hit.paperId}:${hit.proofId ?? hit.statementId ?? (hit.figureNumber ? `figure-${hit.figureNumber}` : hit.chunk.id)}`;
}

/**
 * Original results retain priority; optional AI concepts only add source hits.
 * Unknown scope never falls back to another paper. Model text cannot add papers,
 * links, source bodies, statement numbers or concepts outside the catalog.
 * A semantic expansion is still a suggested match, not verified relevance.
 */
export function searchPaperLibrary(query: string, options: LibrarySearchOptions = {}, library = PAPER_LIBRARY): LibrarySearchHit[] {
  const limit = options.limit ?? 4;
  if (!query.trim() || !Number.isFinite(limit) || limit <= 0) return [];
  const entries = scope(options.paperId, library);
  const maximum = Math.min(12, Math.floor(limit));
  const concepts = new Set(getSearchConcepts(options.paperId, library));
  // A requested theorem/figure/section is a destination, not a semantic hint.
  // Never replace a missing named item with a model-selected nearby concept.
  const refinements = namedReferences(query).length ? [] :
    [...new Set(options.refinedTerms ?? [])].filter((term) => concepts.has(term)).slice(0, 3);
  const retrieve = (text: string) => entries.flatMap(({ id, corpus }) => searchPaper(corpus, text, maximum)
    .map((hit) => ({ ...hit, paperId: id, corpus })))
    .sort((a, b) => b.score - a.score || a.paperId.localeCompare(b.paperId) || a.chunk.id.localeCompare(b.chunk.id));
  const direct = retrieve(query);
  const expanded = refinements.length ? retrieve(refinements.join(' ')) : [];
  const selected: LibrarySearchHit[] = [];
  const seen = new Set<string>();
  const add = (hit: LibrarySearchHit) => {
    const key = identity(hit);
    if (selected.length < maximum && !seen.has(key)) { selected.push(hit); seen.add(key); }
  };
  // Exact named destinations and the strongest original match survive expansion.
  direct.filter((hit) => hit.statementId || hit.proofId || hit.figureNumber).forEach(add);
  direct.slice(0, expanded.length ? Math.max(1, maximum - 1) : maximum).forEach(add);
  expanded.forEach(add);
  direct.forEach(add);
  return selected;
}

/** Re-resolve IDs, bodies and URLs from the registry before source prompting. */
function trustedHits(hits: LibrarySearchHit[], library: PaperLibraryEntry[]): LibrarySearchHit[] {
  return hits.slice(0, 4).flatMap((hit) => {
    const entry = library.find((paper) => paper.id === hit.paperId);
    const chunk = entry && sourceForHit(entry.corpus, hit);
    return entry && chunk ? [{ ...hit, chunk, corpus: entry.corpus }] : [];
  });
}

export function buildLibraryMessages(question: string, hits: LibrarySearchHit[],
  previous: Array<{ role: 'user' | 'assistant'; content: string }> = [], library = PAPER_LIBRARY): PaperMessage[] {
  const safe = trustedHits(hits, library);
  const first = safe[0]?.corpus ?? library[0]?.corpus;
  if (!first) return [{ role: 'system', content: 'No reviewed papers are available. Say that no source evidence is available.' },
    { role: 'user', content: question.trim().slice(0, 2000) }];
  if (safe.every((hit) => hit.corpus === first)) return buildPaperMessages(first, question, safe, previous);
  // Reuse the common grounding rules and bounded complete conversation pairs.
  const messages = buildPaperMessages(first, question, [], previous);
  const system = messages[0].content + '\nFor answers using multiple papers, expand custom macros using the notation supplied beside each excerpt. Output standard TeX only: do not emit paper-specific command names. The same macro or reference label may have different meanings in different papers; never transfer a definition or label between papers. If an expansion is absent, describe the notation in words instead of guessing.';
  messages[0] = { role: 'system', content: system };
  const suffix = `\n\nReader's question:\n${question.trim().slice(0, 2000)}`;
  const prefix = 'Quoted source excerpts from the selected reviewed papers. Paper identifiers disambiguate identical theorem numbers.\n';
  const budget = Math.max(0, 12000 - system.length - prefix.length - suffix.length);
  let body = '';
  safe.forEach((hit, index) => {
    const chunk = hit.chunk;
    const notation = Object.entries(hit.corpus.mathjax_macros)
      .filter(([name]) => chunk.text.includes(`\\${name}`))
      .map(([name, value]) => `\\${name} := ${value}`).join('; ').slice(0, 500);
    let references = '';
    for (const label of new Set([...chunk.text.matchAll(/\\(?:eqref|ref)\{([^}]+)\}/g)].map((match) => match[1]))) {
      const resolution = hit.corpus.label_index[label];
      if (resolution) {
        const line = `${label} = ${resolution.title}\n`;
        if (references.length + line.length <= 700) references += line;
      }
    }
    const header = `\n[${index + 1}] ${chunk.title}\nPaper ${hit.paperId}: ${hit.corpus.paper.title}\n` +
      `Locator ${chunk.page_range_scope}: page ${chunk.page_start}; ${chunk.source_url}\nNotation for this paper only: ${notation}\n` +
      (references ? `Cross-reference key for paper ${hit.paperId} only:\n${references}` : '');
    const available = Math.max(0, Math.floor((budget - body.length) / (safe.length - index)) - header.length - 75);
    body += header + chunk.text.slice(0, available) + (chunk.text.length > available ? '\n[Excerpt truncated; consult source PDF.]' : '') + '\n';
  });
  messages[messages.length - 1] = { role: 'user', content: prefix + body.slice(0, budget) + suffix };
  return messages;
}

export interface CitationAudit {
  text: string; invalidNumbers: number[]; validNumbers: number[]; hasValidCitations: boolean;
}

/** Preserve mathematical intervals, arrays and indices exactly while auditing prose. */
function mapOutsideMath(text: string, prose: (part: string) => string): string {
  const escaped = (position: number) => {
    let slashes = 0;
    while (position > 0 && text[--position] === '\\') slashes += 1;
    return slashes % 2 === 1;
  };
  let output = '', cursor = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (escaped(index)) continue;
    let opener = '', closer = '';
    if (text[index] === '$') opener = closer = text[index + 1] === '$' ? '$$' : '$';
    else if (text[index] === '\\' && text[index + 1] === '(') { opener = '\\('; closer = '\\)'; }
    else if (text[index] === '\\' && text[index + 1] === '[') { opener = '\\['; closer = '\\]'; }
    if (!opener) continue;
    output += prose(text.slice(cursor, index));
    let end = index + opener.length;
    while (end < text.length && (escaped(end) || !text.startsWith(closer, end))) end += 1;
    // A stopped answer can contain unfinished math; never modify its contents.
    end = end < text.length ? end + closer.length : text.length;
    output += text.slice(index, end);
    cursor = end;
    index = end - 1;
  }
  return output + prose(text.slice(cursor));
}

/** This checks reference existence, not whether prose follows mathematically. */
export function validateAnswerCitations(answer: string, hits: SearchHit[], messages?: PaperMessage[]): CitationAudit {
  const invalidNumbers = new Set<number>();
  const validNumbers = new Set<number>();
  // A definition prompt may intentionally contain just one of the UI passages.
  // When supplied, the actual prompt further restricts usable source numbers.
  const supplied = messages ? new Set([...(messages.at(-1)?.content ?? '').matchAll(/^\[(\d+)\] /gm)].map((match) => Number(match[1]))) : undefined;
  const text = mapOutsideMath(answer, (prose) => {
  const grouped = prose.replace(/\[(\d+(?:\s*[,;–-]\s*\d+)+)\]/g, (_original, group: string) => {
    // Expand conventional small citation ranges before checking every number.
    const numbers = group.split(/\s*[,;]\s*/).flatMap((part) => {
      const range = /^(\d+)\s*[–-]\s*(\d+)$/.exec(part);
      if (!range) return [Number(part)];
      const start = Number(range[1]), end = Number(range[2]);
      if (end < start || end - start > 12) return [0];
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });
    return numbers.map((number) => `[${number}]`).join(' ');
  });
  return grouped.replace(/\[(\d+)\]/g, (original, digits: string) => {
    const number = Number(digits);
    if (Number.isSafeInteger(number) && number >= 1 && number <= hits.length && (!supplied || supplied.has(number))) { validNumbers.add(number); return original; }
    invalidNumbers.add(number);
    return '[unverified reference]';
  });
  });
  return { text, invalidNumbers: [...invalidNumbers], validNumbers: [...validNumbers], hasValidCitations: validNumbers.size > 0 };
}
