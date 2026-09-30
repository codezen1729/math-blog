'use client';

/* oxlint-disable next/no-img-element -- Relative archive assets must work in both the Vite GitHub Pages build and the local Next preview. */

import { lazy, Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import katex from 'katex';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Orbit,
  Search,
} from 'lucide-react';
import postsJson from '@/lib/generated-post-index.json';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { legacyCleanDestination, normalizeBlogRoute, personalWebpage, blogPageMetadata, blogTitle, blogSubtitle, phaseForLegacyTrack } from '@/lib/blog-routes';
import { articleFigureWidth, type FigureInfo } from '@/lib/figure-sizing';
import figureMetadataJson from '@/lib/figure-metadata.json';
import figureDescriptionsJson from '@/lib/figure-descriptions.json';

type Post = {
  order: number;
  slug: string;
  title: string;
  dek: string;
  excerptHtml: string;
  mathMacros?: Record<string, string>;
  phase: number;
  phaseLabel: string;
  track: string;
  kind: string;
  minutes: number;
  wordCount: number;
  prerequisites: string[];
  background?: string[];
  sourceCollection: string;
  sourcePath: string;
  sourceStart: number;
  sourceEnd: number;
  sourceSegments?: {source: string; start: number; end: number; sha256: string}[];
  sourceUrl?: string;
  status: string;
};

type FullPost = Post & { html: string; mathMacros?: Record<string, string> };
type SearchRecord = { slug: string; title: string; series: string; headings: string[]; theoremNames: string[]; figureDescriptions?: string[]; text: string };

type TocItem = { id: string; text: string; level: number };

// The generated records are validated by scripts/check-content.mjs.
const posts = postsJson as unknown as Post[];
const essays = posts.filter((post) => post.track !== 'Research');
const postModules = import.meta.glob<{default: FullPost}>('../lib/posts/*.json');
const LazyLabPage = lazy(() => import('@/components/lab-page'));
const series = [
  { slug: 'k-theory', title: 'K-theory', phase: 3, description: 'Bundles · Stable structures · K-theory', figure: 'figures/k-theory/hopf-fibration.webp' },
  { slug: 'dynamics', title: 'Complex Dynamics', phase: 4, description: 'Iteration · Surgery · Dimension', figure: 'figures/surgeries/j1.webp' },
  { slug: 'surfaces-and-curves', title: 'Surfaces and Curves', phase: 2, description: 'Topology · Elliptic curves · Abelian functions', figure: 'figures/elliptic-curves/torus.webp' },
  { slug: 'standard-tools', title: 'Standard Tools in Complex Analysis', phase: 1, description: 'Geometry · Contours · Holomorphic functions', figure: 'figures/complex-analysis/note3-fig-09.svg' },
  { slug: 'commutative-algebra', title: 'Commutative Algebra', phase: 5, description: 'Rings · Modules · Affine geometry', figure: 'figures/commutative-algebra/ca1-fig-05.svg' },
  { slug: 'ergodic-theory', title: 'Ergodic Theory', phase: 6, description: 'Recurrence · Mixing · Invariant measures', figure: 'figures/ergodic-theory/lecture5-fig-01.svg' },
  { slug: 'lemma-book', title: 'Lemma Book (Olympiad Days)', phase: 7, description: 'Olympiad problems · Inequalities · Geometry', figure: 'figures/lemma-book/lb1-fig-01.svg' },
  { slug: 'miscellaneous', title: 'Miscellaneous', phase: 8, description: 'Categories · Distances · Prime gaps', figure: 'figures/miscellaneous/m1-fig-01.svg' },
];
const recommendations = [
  { title: 'Sketches of Topology', url: 'https://sketchesoftopology.wordpress.com/' },
  { title: 'Geometry and the imagination', url: 'https://lamington.wordpress.com/' },
  { title: 'The n-Category Café', url: 'https://golem.ph.utexas.edu/category/' },
  { title: "What's new", url: 'https://terrytao.wordpress.com/' },
  { title: "Gowers's Weblog", url: 'https://gowers.wordpress.com/' },
  { title: 'Azimuth', url: 'https://johncarlosbaez.wordpress.com/' },
  { title: 'And Other Withered Stumps Of Time', url: 'https://witheredstumps.wordpress.com/' },
  { title: 'Sebastian Raschka', url: 'https://sebastianraschka.com/' },
  { title: 'Andrej Karpathy blog', url: 'https://karpathy.github.io/' },
  { title: "Lil'Log", url: 'https://lilianweng.github.io/' },
  { title: 'Proofs and Prompts', url: 'https://proofsandprompts.com/' },
  { title: 'Combinatorics and more', url: 'https://gilkalai.wordpress.com/' },
  { title: 'Low Dimensional Topology', url: 'https://ldtopology.wordpress.com/' },
  { title: 'Math Scholar', url: 'https://mathscholar.org/' },
  { title: 'mathematical musings', url: 'https://matthewkahle.wordpress.com/page/2/' },
];
const figureMetadata = figureMetadataJson as Record<string, FigureInfo>;
const figureDescriptions = figureDescriptionsJson as Record<string, string>;
function seriesFor(post: Post) { return series.find(item => item.phase === post.phase); }
function enlargedFigureWidth(src: string) {
  const info = figureMetadata[src];
  if (!info) return 800;
  const vector = info.kind === 'vector';
  const comfortableBase = Math.max(600, articleFigureWidth(info, vector, src));
  return vector ? Math.min(1200, comfortableBase) : Math.min(info.width, comfortableBase);
}
const katexMacros = {
  '\\C': '\\mathbb{C}', '\\R': '\\mathbb{R}', '\\Q': '\\mathbb{Q}', '\\Z': '\\mathbb{Z}', '\\N': '\\mathbb{N}', '\\D': '\\mathbb{D}', '\\T': '\\mathbb{T}',
  '\\Res': '\\operatorname{Res}', '\\Int': '\\operatorname{Int}', '\\Ext': '\\operatorname{Ext}', '\\supp': '\\operatorname{supp}',
  '\\xlongrightarrow': '\\xrightarrow', '\\qed': '\\square',
};
function routeHref(route: string, fragment?: string) {
  const clean = route.replace(/^\/+|\/+$/g, '');
  return `${clean ? `${clean}/` : ''}${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
}

function locationArticleReference() {
  const hash = window.location.hash;
  if (hash && !hash.startsWith('#/')) {
    try { return decodeURIComponent(hash.slice(1)); } catch { return hash.slice(1); }
  }
  return new URLSearchParams(readPageRoute().split('?')[1] ?? '').get('ref') ?? undefined;
}

function revealArticleReference(reference: string) {
  const target = document.querySelector<HTMLElement>(`.article-prose [id="${CSS.escape(reference)}"]`);
  if (!target) return false;
  const focus = target.classList.contains('reference-target') ? (target.nextElementSibling ?? target.parentElement) : target;
  target.scrollIntoView({behavior: 'auto', block: 'start'});
  if (focus instanceof HTMLElement) { focus.tabIndex = -1; focus.focus({preventScroll: true}); }
  return true;
}

function readPageRoute() {
  if (window.location.hash.startsWith('#/')) return normalizeBlogRoute(window.location.hash);
  const suffix = window.location.search ? window.location.search : '';
  const declared = document.querySelector<HTMLMetaElement>('meta[name="blog-route"]')?.content;
  if (declared) return `${declared}${suffix}`;
  const match = window.location.pathname.match(/\/(post\/[^/]+|series\/[^/]+|blog|lab)\/?$/);
  if (!match) return `blog${suffix}`;
  if (match[1].startsWith('series/')) return `blog/${match[1].slice('series/'.length)}${suffix}`;
  return `${match[1]}${suffix}`;
}

function subscribeToPageRoute(onStoreChange: () => void) {
  window.addEventListener('hashchange', onStoreChange);
  window.addEventListener('popstate', onStoreChange);
  return () => {
    window.removeEventListener('hashchange', onStoreChange);
    window.removeEventListener('popstate', onStoreChange);
  };
}

function usePageRoute() {
  return useSyncExternalStore(subscribeToPageRoute, readPageRoute, () => 'blog');
}

function MetaLine({ post }: { post: Post }) {
  return (
    <p className="post-meta">
      <span>{seriesFor(post)?.title ?? 'Blog'}</span>
      <span><Clock3 aria-hidden="true" /> {post.minutes} min read</span>
    </p>
  );
}

function SiteHeader({ onSearch, route }: { onSearch: () => void; route: string }) {
  return <header className="blog-masthead">
    <div className="blog-masthead-title"><a href={routeHref('blog')}>{blogTitle}<span>{blogSubtitle}</span></a><Button variant="ghost" size="icon" onClick={onSearch} aria-label="Search the blog"><Search aria-hidden="true" /></Button></div>
    <nav className="blog-navigation" aria-label="Primary navigation">
      <a href={routeHref('blog')} aria-current={/^(blog|post)([/?]|$)/.test(route) ? 'page' : undefined}>All posts</a>
      <a href={routeHref('lab')} aria-current={route === 'lab' ? 'page' : undefined}>Laboratory</a>
      <a className="blog-personal-link" href={personalWebpage}>Personal webpage <span aria-hidden="true">↗</span></a>
    </nav>
  </header>;
}

function SiteFooter() {
  return <footer className="blog-footer"><p>{blogTitle} · S. Viswanathan</p><nav aria-label="Footer"><a href="rss.xml">RSS</a><a href={personalWebpage}>Personal webpage ↗</a></nav></footer>;
}

function SearchPanel({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchRecord[] | null>(null);
  const [indexError, setIndexError] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || index || indexError) return;
    let cancelled = false;
    fetch(new URL('search-index.json', document.baseURI))
      .then(response => {
        if (!response.ok) throw new Error(`Search index returned ${response.status}`);
        return response.json() as Promise<SearchRecord[]>;
      })
      .then(records => { if (!cancelled) setIndex(records); })
      .catch(() => { if (!cancelled) setIndexError(true); });
    return () => { cancelled = true; };
  }, [open, index, indexError]);
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return essays.slice(0, 8).map(post => ({post, snippet: post.title, score: 0}));
    const terms = value.split(/\s+/).filter(Boolean);
    return (index ?? []).map(record => {
      const post = essays.find(item => item.slug === record.slug);
      if (!post) return null;
      const title = record.title.toLowerCase();
      const headings = record.headings.join(' ').toLowerCase();
      const theoremNames = record.theoremNames.join(' ').toLowerCase();
      const seriesName = record.series.toLowerCase();
      const body = record.text.toLowerCase();
      if (!terms.every(term => `${title} ${headings} ${theoremNames} ${seriesName} ${body}`.includes(term))) return null;
      const score = terms.reduce((total, term) => total
        + (title.includes(term) ? 8 : 0)
        + (headings.includes(term) || theoremNames.includes(term) ? 5 : 0)
        + (seriesName.includes(term) ? 3 : 0)
        + (body.includes(term) ? 1 : 0), 0);
      const figure = record.figureDescriptions?.find(description => terms.every(term => description.toLowerCase().includes(term)));
      const snippetText = figure || record.text;
      const snippetLower = snippetText.toLowerCase();
      const first = Math.max(0, Math.min(...terms.map(term => {
        const found = snippetLower.indexOf(term);
        return found < 0 ? snippetLower.length : found;
      })) - 75);
      const start = first > 0 ? snippetText.indexOf(' ', first) + 1 : 0;
      const raw = snippetText.slice(start, start + 210).trim();
      const snippet = `${figure ? 'Figure: ' : ''}${start > 0 ? '…' : ''}${raw}${start + 210 < snippetText.length ? '…' : ''}`;
      return {post, snippet, score};
    }).filter((item): item is {post: Post; snippet: string; score: number} => Boolean(item))
      .sort((a, b) => b.score - a.score || a.post.order - b.post.order)
      .slice(0, 12);
  }, [query, index]);
  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = [...(resultsRef.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])];
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    links[(current + direction + links.length) % links.length].focus();
  };
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) setQuery(''); setOpen(nextOpen); }}>
      <DialogContent className="search-dialog">
        <DialogHeader>
          <DialogTitle>Search the blog</DialogTitle>
          <DialogDescription>Find an essay by idea, theorem, or branch of mathematics.</DialogDescription>
        </DialogHeader>
        <div className="search-field-wrap"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “Riemann”, “entropy”, or “bundles”…" aria-label="Search essays" /></div>
        <p className="sr-only" aria-live="polite">{query && index ? `${results.length} search ${results.length === 1 ? 'result' : 'results'}` : ''}</p>
        <div ref={resultsRef} className="search-results" aria-label="Search results" onKeyDown={moveFocus}>
          {results.map(({post, snippet}) => (
            <a key={post.slug} href={routeHref(`post/${post.slug}`)} onClick={() => setOpen(false)}>
              <span>{String(post.order).padStart(2, '0')}</span>
              <div><strong>{post.title}</strong><small>{seriesFor(post)?.title ?? post.track} · {post.minutes} min</small>{query && <em>{snippet}</em>}</div>
              <ArrowRight aria-hidden="true" />
            </a>
          ))}
          {query && !index && !indexError && <p className="empty-search">Preparing the full-text index…</p>}
          {indexError && <p className="empty-search">The search index could not be loaded. Browse by topic below instead.</p>}
          {index && !results.length && <p className="empty-search">No essays match “{query}”.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function excerptFor(post: Post) {
  return renderMathFragments(post.excerptHtml || '', post.mathMacros);
}

function SidebarDisclosure({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 850px)');
    const sync = () => setOpen(!media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return <details className={`journal-disclosure ${className}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><h2>{title}</h2></summary>{children}
  </details>;
}

function BlogSidebar({ active }: { active?: typeof series[number] }) {
  const entries = active ? essays.filter(post => post.phase === active.phase) : [];
  return <aside className="journal-sidebar">
    <section><h2>Search</h2><Button className="journal-search-button" variant="outline" onClick={() => window.dispatchEvent(new Event('open-site-search'))}><span>Search the blog</span><Search aria-hidden="true" /></Button></section>
    <section><h2>Topics</h2><ul className="journal-topics"><li><a href={routeHref('blog')} aria-current={!active ? 'page' : undefined}>All posts <span>{essays.length}</span></a></li>{series.map(item => <li key={item.slug}><a href={routeHref(`series/${item.slug}`)} aria-current={active?.slug === item.slug ? 'page' : undefined}>{item.title}<span>{essays.filter(post => post.phase === item.phase).length}</span></a></li>)}</ul></section>
    {active && <SidebarDisclosure className="journal-series" title="In this series"><ol className="journal-contents">{entries.map(post => <li key={post.slug}><a href={routeHref(`post/${post.slug}`)}>{post.title}</a></li>)}</ol></SidebarDisclosure>}
    <SidebarDisclosure title="Blog Recommendations"><ul className="journal-topics journal-blogroll">{recommendations.map(recommendation => <li key={recommendation.url}><a href={recommendation.url} target="_blank" rel="noopener noreferrer">{recommendation.title}</a></li>)}</ul></SidebarDisclosure>
  </aside>;
}

function BlogPage({ route }: { route: string }) {
  const requested = route.split('?')[0].split('/')[1];
  const params = new URLSearchParams(route.split('?')[1]);
  const oldTrack = params.get('track');
  const legacyPhase = oldTrack ? phaseForLegacyTrack(oldTrack) : undefined;
  const legacyPost = oldTrack ? essays.find(post => post.track.toLowerCase() === oldTrack.trim().toLowerCase()) : undefined;
  const active = series.find(item => item.slug === (requested === 'structures' ? 'k-theory' : requested))
    ?? (legacyPhase ? series.find(item => item.phase === legacyPhase) : undefined)
    ?? (legacyPost ? seriesFor(legacyPost) : undefined);
  const selected = active ? essays.filter(post => post.phase === active.phase) : essays;
  const pageCount = Math.ceil(selected.length / 6);
  const requestedPage = Number(params.get('page') || 1);
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const shown = selected.slice((page - 1) * 6, page * 6);
  const base = active ? `series/${active.slug}` : 'blog';
  return <main id="main-content" className="journal-page">
    <div className="journal-content">
    {active && <a className="journal-back" href={routeHref('blog')}>← Blog</a>}
    <header className={`journal-heading ${active ? '' : 'journal-index-heading'}`}><h1>{active?.title ?? 'All posts'}</h1></header>
    <div className="journal-columns">
      <BlogSidebar active={active} />
      <div className="journal-feed">
        {shown.map(post => {
          const group = seriesFor(post);
          const part = essays.filter(item => item.phase === post.phase).findIndex(item => item.slug === post.slug) + 1;
          return <article className="journal-entry" key={post.slug}>
            <header><h2><a href={routeHref(`post/${post.slug}`)}>{post.title}</a></h2><p className="journal-meta">S. Viswanathan · <a href={routeHref(`series/${group?.slug}`)}>{group?.title}</a> · Part {part}</p></header>
            <div className="journal-excerpt" dangerouslySetInnerHTML={{ __html: excerptFor(post) }} />
            <a className="journal-read-more" href={routeHref(`post/${post.slug}`)}>Continue reading →</a>
          </article>;
        })}
        {pageCount > 1 && <nav className="journal-pagination" aria-label="Blog pages">{page > 1 ? <a href={`${routeHref(base)}?page=${page - 1}`}>← Previous page</a> : <span />}<span>{page} / {pageCount}</span>{page < pageCount ? <a href={`${routeHref(base)}?page=${page + 1}`}>Next page →</a> : <span />}</nav>}
      </div>
    </div>
    </div>
  </main>;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function escapeAttributeText(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function renderMathFragments(source: string, sourceMacros: Record<string, string> = {}) {
  return source.replace(/<span class="math (inline|display)">([\s\S]*?)<\/span>/g, (full, mode: 'inline' | 'display', encodedMath: string) => {
    const displayMode = mode === 'display';
    const decoded = decodeHtmlEntities(encodedMath.trim());
    const delimiters = displayMode
      ? [['\\[', '\\]'], ['$$', '$$']]
      : [['\\(', '\\)'], ['$', '$']];
    const match = delimiters.find(([left, right]) => decoded.startsWith(left) && decoded.endsWith(right));
    const math = match ? decoded.slice(match[0].length, -match[1].length) : decoded;
    try {
      return `<span class="math ${mode}">${katex.renderToString(math, { displayMode, throwOnError: false, strict: false, macros: { ...katexMacros, ...sourceMacros } })}</span>`;
    } catch {
      return full;
    }
  });
}

function prepareArticleHtml(source: string, sourceMacros: Record<string, string> = {}, articleTitle = 'the manuscript', articleSlug = '') {
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  let html = source.replace(/href="#\/post\/([^?"#]+)(?:\?ref=([^"#]+))?"/g, (_full, slug: string, reference?: string) => {
    const target = reference ? decodeURIComponent(reference) : undefined;
    return `href="${routeHref(`post/${slug}`, target)}"`;
  });
  html = html.replace(/<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi, (full, rawLevel: string, rawAttributes: string, body: string) => {
    const level = Number(rawLevel);
    const text = body
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim() || 'Section';
    const existingId = rawAttributes.match(/\sid=(['"])(.*?)\1/i)?.[2];
    const base = existingId || text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    const number = seen.get(base) ?? 0;
    seen.set(base, number + 1);
    const id = existingId || (number ? `${base}-${number + 1}` : base);
    toc.push({ id, text, level });
    const attributes = existingId ? rawAttributes : `${rawAttributes} id="${id}"`;
    return `<h${level}${attributes}>${body}<a class="heading-permalink" href="#${encodeURIComponent(id)}" aria-label="Link to ${escapeAttributeText(text)}">§</a></h${level}>`;
  });
  const captions = new Map<string, string>();
  for (const figure of source.matchAll(/<figure\b[^>]*>([\s\S]*?)<\/figure>/g)) {
    const caption = figure[1].match(/<figcaption>([\s\S]*?)<\/figcaption>/)?.[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (caption) for (const picture of figure[1].matchAll(/src="([^"]+)"/g)) captions.set(picture[1], decodeHtmlEntities(caption));
  }
  let imageNumber = 0;
  // Keep captions as alternative text, without the printed handout titles.
  html = html.replace(/<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/gi, '');
  const escapeAttribute = escapeAttributeText;
  html = html.replace(/<img\b([^>]*)>/g, (full, attributes: string) => {
    const src = attributes.match(/src="([^"]+)"/)?.[1];
    if (!src) return full;
    const info = figureMetadata[decodeHtmlEntities(src)];
    imageNumber++;
    const caption = captions.get(src) || figureDescriptions[decodeHtmlEntities(src)] || `Mathematical diagram ${imageNumber} accompanying ${articleTitle}.`;
    let clean = attributes.replace(/\s(?:style|width|height)="[^"]*"/g, '');
    const existingAlt = clean.match(/\salt="([^"]*)"/);
    if (!existingAlt || /^(?:image|figure)$/i.test(decodeHtmlEntities(existingAlt[1]).trim())) {
      clean = clean.replace(/\salt="[^"]*"/, '') + ' alt="' + escapeAttribute(caption) + '"';
    }
    const vector = info?.kind === 'vector' || src.endsWith('.svg');
    const dimensions = info ? ` width="${Math.round(info.width)}" height="${Math.round(info.height)}" style="width:${articleFigureWidth(info, vector, decodeHtmlEntities(src))}px;max-width:${vector ? 'none' : '100%'};height:auto"` : '';
    const picture = `<a class="figure-zoom" href="${src}" target="_blank" rel="noreferrer" aria-label="Enlarge: ${escapeAttribute(caption)}"><img${clean}${dimensions}></a>`;
    return vector ? `<span class="figure-scroll" data-scroll-label="Scrollable diagram: ${escapeAttribute(caption)}">${picture}</span>` : picture;
  });
  // The document's <base> points at the site root for shared assets. A bare
  // fragment would consequently leave the article when copied or opened.
  html = html.replace(/href="#(?!\/)([^"]*)"/g, (_full, fragment: string) =>
    `href="post/${articleSlug}/#${fragment}"`);
  return { html: renderMathFragments(html, sourceMacros), toc };
}

function ArticleBody({ post }: { post: Post }) {
  const ref = useRef<HTMLDivElement>(null);
  const [enlarged, setEnlarged] = useState<{src: string; alt: string} | null>(null);
  const [figureScale, setFigureScale] = useState(1);
  const [tocOpen, setTocOpen] = useState(false);
  const fullPost = post as FullPost;
  const prepared = useMemo(() => prepareArticleHtml(fullPost.html, fullPost.mathMacros, fullPost.title, fullPost.slug), [fullPost.html, fullPost.mathMacros, fullPost.title, fullPost.slug]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 851px)');
    const sync = () => setTocOpen(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [fullPost.slug]);
  useEffect(() => {
    const article = ref.current;
    if (!article) return;
    const followInternalLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest('a');
      const href = link?.getAttribute('href');
      if (link?.classList.contains('figure-zoom') && href && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setFigureScale(1); setEnlarged({src: href, alt: link.querySelector('img')?.alt || 'Figure'}); return; }
      if (!href || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const destination = new URL(href, document.baseURI);
      if (destination.origin !== location.origin || destination.pathname !== location.pathname || !destination.hash) return;
      const target = article.querySelector<HTMLElement>(`[id="${CSS.escape(decodeURIComponent(destination.hash.slice(1)))}"]`);
      if (!target) return;
      event.preventDefault();
      window.history.pushState(null, '', destination.href);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const focus = target.classList.contains('reference-target') ? (target.nextElementSibling ?? target.parentElement) : target;
      if (focus instanceof HTMLElement) { focus.tabIndex = -1; focus.focus({preventScroll: true}); }
    };
    article.addEventListener('click', followInternalLink);
    const figureScrollers = [...article.querySelectorAll<HTMLElement>('.figure-scroll')];
    const syncFigureScrollers = () => {
      for (const scroller of figureScrollers) {
        const overflows = scroller.scrollWidth > scroller.clientWidth + 1;
        if (overflows) {
          scroller.tabIndex = 0;
          scroller.setAttribute('role', 'region');
          scroller.setAttribute('aria-label', scroller.dataset.scrollLabel || 'Scrollable diagram');
        } else {
          scroller.removeAttribute('tabindex');
          scroller.removeAttribute('role');
          scroller.removeAttribute('aria-label');
        }
      }
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncFigureScrollers);
    for (const scroller of figureScrollers) resizeObserver?.observe(scroller);
    syncFigureScrollers();
    return () => {
      article.removeEventListener('click', followInternalLink);
      resizeObserver?.disconnect();
    };
  }, [fullPost.slug, fullPost.html]);
  return (
    <>
      <details className="article-toc" aria-label="On this page" open={tocOpen} onToggle={event => setTocOpen(event.currentTarget.open)}>
        <summary>On this page</summary>
        {prepared.toc.length ? <ol>{prepared.toc.map((item) => <li key={item.id} className={`toc-level-${item.level}`}><a href={routeHref(`post/${fullPost.slug}`, item.id)}>{item.text}</a></li>)}</ol> : <span>This passage has no internal headings.</span>}
      </details>
      <div ref={ref} className="article-prose" dangerouslySetInnerHTML={{ __html: prepared.html }} />
      <Dialog open={Boolean(enlarged)} onOpenChange={open => { if (!open) setEnlarged(null); }}><DialogContent className="figure-dialog"><DialogHeader><DialogTitle>Figure</DialogTitle><DialogDescription>Zoom in for detail; scroll to move around the diagram.</DialogDescription></DialogHeader>{enlarged && <><div className="figure-controls" aria-label="Figure magnification"><Button variant="outline" onClick={() => setFigureScale(value => Math.max(1, value / 1.25))} disabled={figureScale <= 1} aria-label="Zoom out of figure">−</Button><Button variant="ghost" onClick={() => setFigureScale(1)} aria-label="Reset figure zoom">{Math.round(figureScale * 100)}%</Button><Button variant="outline" onClick={() => setFigureScale(value => Math.min(4, value * 1.25))} disabled={figureScale >= 4} aria-label="Zoom into figure">+</Button></div><div className="enlarged-figure" tabIndex={0} role="region" aria-label="Enlarged diagram"><img src={enlarged.src} alt={enlarged.alt} style={{width: enlargedFigureWidth(enlarged.src) * figureScale, maxWidth: figureScale <= 1 ? '100%' : 'none'}} /></div><a href={enlarged.src} target="_blank" rel="noreferrer">Open full-size figure ↗</a></>}</DialogContent></Dialog>
    </>
  );
}

function ArticlePage({ post }: { post: Post }) {
  const group = seriesFor(post);
  const sequence = essays.filter(item => item.phase === post.phase);
  const index = sequence.findIndex(item => item.slug === post.slug);
  const previous = sequence[index - 1];
  const next = sequence[index + 1];
  return (
    <main id="main-content" className="article-page">
      <div className="article-content">
      <div className="article-breadcrumb"><a href={routeHref(group ? `series/${group.slug}` : 'blog')}><ArrowLeft /> {group?.title ?? 'Blog'}</a><span>Part {index + 1} of {sequence.length}</span></div>
      <article>
        <header className="article-header">
          <p className="kicker">Part {String(index + 1).padStart(2, '0')}</p>
          <h1>{post.title}</h1>
          <MetaLine post={post} />
        </header>
        {(post.prerequisites.length > 0 || Boolean(post.background?.length)) && <aside className="reading-background"><strong>Background</strong><p>{post.prerequisites.map((slug, n) => { const prerequisite = essays.find((entry) => entry.slug === slug); return prerequisite ? <span key={slug}>{n > 0 ? ' · ' : ''}<a href={routeHref(`post/${slug}`)}>{prerequisite.title}</a></span> : null; })}{post.prerequisites.length > 0 && Boolean(post.background?.length) ? ' · ' : ''}{post.background?.join(' · ')}</p></aside>}
        <div className="article-layout"><ArticleBody post={post} /></div>
        <nav className="article-next-prev" aria-label="Adjacent essays">
          {previous ? <a href={routeHref(`post/${previous.slug}`)}><span><ArrowLeft /> Previous</span><strong>{previous.title}</strong></a> : <span />}
          {next ? <a href={routeHref(`post/${next.slug}`)}><span>Next <ArrowRight /></span><strong>{next.title}</strong></a> : <a href={routeHref('blog')}><span>Continue <ArrowRight /></span><strong>Explore the other series</strong></a>}
        </nav>
      </article>
      </div>
    </main>
  );
}

function ArticleRoute({ slug }: { slug: string }) {
  const [post, setPost] = useState<FullPost | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loader = postModules[`../lib/posts/${slug}.json`];
  useEffect(() => {
    let current = true;
    setPost(null); setLoadError(false);
    loader?.().then(module => { if (current) setPost(module.default); }).catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, [loader, slug, attempt]);
  useEffect(() => {
    if (!post) return;
    const reference = locationArticleReference();
    if (!reference) return;
    const frame = window.requestAnimationFrame(() => revealArticleReference(reference));
    return () => window.cancelAnimationFrame(frame);
  }, [post, slug]);
  if (!loader) return <NotFound />;
  if (loadError) return <main id="main-content" className="article-page"><div className="article-content"><div className="not-found"><h1>The article could not open</h1><p>The text is still available after the page module is loaded again.</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div></div></main>;
  if (!post) return <main id="main-content" className="article-page" aria-busy="true"><div className="article-content"><p className="article-loading">Opening the article…</p></div></main>;
  return <ArticlePage post={post} />;
}

function NotFound() {
  return <main id="main-content" className="not-found-page"><div className="not-found"><Orbit /><h1>Page not found</h1><p>The requested essay is not in the archive.</p><a href={routeHref('blog')}>Return to the blog</a></div></main>;
}

function AcademicPageMoved() {
  return <main id="main-content" className="not-found-page"><div className="not-found"><h1>Looking for my personal webpage?</h1><p>My academic information is on my Google webpage. This site is now just the mathematical blog and Laboratory.</p><a href={personalWebpage}>Visit my personal webpage ↗</a><a href={routeHref('blog')}>Read the blog</a></div></main>;
}

export function SiteApp() {
  const route = usePageRoute();
  const [searchOpen, setSearchOpen] = useState(false);
  const previousRoute = useRef(route);
  useEffect(() => {
    if (!window.location.hash.startsWith('#/')) return;
    const destination = legacyCleanDestination(window.location.hash);
    window.location.replace(new URL(destination, document.baseURI));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((!typing && event.key === '/') || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault(); setSearchOpen(true);
      }
    };
    const onCustom = () => setSearchOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-site-search', onCustom);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-site-search', onCustom); };
  }, []);

  useEffect(() => {
    const previousPage = previousRoute.current.split('?')[0];
    const currentPage = route.split('?')[0];
    const reference = new URLSearchParams(route.split('?')[1]).get('ref');
    const isBlogPageChange = /^(blog|path|archive)/.test(route) && previousRoute.current !== route;
    previousRoute.current = route;
    if (previousPage === currentPage && !isBlogPageChange && !reference) return;
    if (!reference) window.scrollTo({ top: 0, behavior: 'auto' });
    const frame = window.requestAnimationFrame(() => {
      if (reference && revealArticleReference(reference)) return;
      const heading = document.querySelector<HTMLElement>('.weblog-page main h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  useEffect(() => {
    const page = route.split('?')[0];
    const post = page.startsWith('post/') ? essays.find(item => item.slug === page.slice(5)) : undefined;
    const group = series.find(item => page === `blog/${item.slug}` || (item.slug === 'k-theory' && page === 'blog/structures'));
    const titles: Record<string, string> = {vita: 'Personal webpage', research: 'Personal webpage', lab: 'Laboratory'};
    const title = post?.title ?? group?.title ?? titles[page];
    const description = post ? `${post.title}. A post in ${seriesFor(post)?.title ?? 'Mathematics'} by S. Viswanathan.` : group ? `${group.title}: a series of mathematical blog posts by S. Viswanathan.` : page === 'lab' ? 'Explore Mandelbrot and Julia sets, critical orbits, and moving connectedness loci.' : undefined;
    const metadata = blogPageMetadata(title, description, Boolean(post));
    document.title = metadata.title;
    const setMeta = (attribute: 'name' | 'property', key: string, value?: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (value === undefined) { element?.remove(); return; }
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = value;
    };
    setMeta('name', 'description', metadata.description);
    setMeta('property', 'og:title', metadata.title);
    setMeta('property', 'og:description', metadata.description);
    setMeta('property', 'og:type', metadata.type);
    setMeta('name', 'twitter:title', metadata.title);
    setMeta('name', 'twitter:description', metadata.description);
    const image = metadata.useSiteImage ? new URL('og.png', document.baseURI).href : undefined;
    setMeta('property', 'og:image', image);
    setMeta('property', 'og:image:alt', image ? `${blogTitle} — ${blogSubtitle}` : undefined);
    setMeta('property', 'og:image:width', image ? '1731' : undefined);
    setMeta('property', 'og:image:height', image ? '909' : undefined);
    setMeta('name', 'twitter:image', image);
    setMeta('name', 'twitter:image:alt', image ? `${blogTitle} — ${blogSubtitle}` : undefined);
    setMeta('name', 'twitter:card', metadata.useSiteImage ? 'summary_large_image' : 'summary');
  }, [route]);

  let content: ReactNode;
  if (/^blog([/?]|$)/.test(route)) content = <BlogPage route={route} />;
  else if (/^(vita|research)([/?]|$)/.test(route)) content = <AcademicPageMoved />;
  else if (route === 'lab') content = <Suspense fallback={<main id="main-content" className="lab-page" aria-busy="true"><div className="blog-laboratory-content"><p className="article-loading">Opening the Laboratory…</p></div></main>}><LazyLabPage /></Suspense>;
  else if (route.startsWith('post/')) {
    const slug = route.slice('post/'.length).split('?')[0];
    content = essays.some(item => item.slug === slug) ? <ArticleRoute slug={slug} /> : <NotFound />;
  } else content = <NotFound />;

  return (
    <div className="site-background standalone-blog">
      <a className="skip-link" href={`${typeof window === 'undefined' ? 'blog/' : window.location.pathname + window.location.search}#main-content`}>Skip to the article</a>
      <div className="weblog-page">
        <SiteHeader route={route} onSearch={() => setSearchOpen(true)} />
        {content}
        <SiteFooter />
      </div>
      <SearchPanel open={searchOpen} setOpen={setSearchOpen} />
    </div>
  );
}
