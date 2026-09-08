export const personalWebpage = 'https://sites.google.com/view/viswanathan1729/navigate';
export const blogTitle = 'The Iteration Café';
export const blogSubtitle = 'a math blog by S. Viswanathan';
export const blogDescription = 'Mathematical writing by S. Viswanathan: K-theory, complex dynamics, commutative algebra, ergodic theory, surfaces and curves, and tools in complex analysis.';

export function blogPageMetadata(title?: string, description = blogDescription, article = false) {
  return { title: title ? `${title} · ${blogTitle}` : blogTitle, description, type: article ? 'article' : 'website', useSiteImage: !article };
}

const legacyTrackPhases: Record<string, number> = {
  'complex analysis': 1,
  'riemann surfaces': 2,
  'elliptic curves': 2,
  'abelian functions': 2,
  'surfaces and curves': 2,
  structures: 3,
  'k-theory': 3,
  'complex dynamics': 4,
  'thermodynamic formalism': 6,
  'commutative algebra': 5,
  'ergodic theory': 6,
  'the lemma book': 7,
  'lemma book (olympiad days)': 7,
  miscellaneous: 8,
};

export function phaseForLegacyTrack(track: string): number | undefined {
  return legacyTrackPhases[track.trim().toLowerCase()];
}

export function normalizeBlogRoute(hash: string): string {
  const route = hash.replace(/^#\/?/, '');
  const [page, query] = route.split('?');
  const suffix = query ? `?${query}` : '';
  if (!page || /^home\/?$/.test(page)) return `blog${suffix}`;
  if (/^recommendations\/?$/.test(page)) return `blog${suffix}`;
  if (/^(path|archive)(\/|$)/.test(page)) return `${page.replace(/^(path|archive)/, 'blog')}${suffix}`;
  return route;
}

const phaseSeriesSlugs: Record<number, string> = {
  1: 'standard-tools', 2: 'surfaces-and-curves', 3: 'k-theory', 4: 'dynamics',
  5: 'commutative-algebra', 6: 'ergodic-theory', 7: 'lemma-book', 8: 'miscellaneous',
};

/** Convert a retired hash route into one clean, directly loadable page path. */
export function legacyCleanDestination(hash: string): string {
  const normalized = normalizeBlogRoute(hash);
  const [rawPage, rawQuery = ''] = normalized.split('?');
  const params = new URLSearchParams(rawQuery);
  let page = rawPage.replace(/\/+$/, '') || 'blog';
  if (page.startsWith('blog/')) page = `series/${page.slice('blog/'.length)}`;
  const track = params.get('track');
  if (page === 'blog' && track) {
    const phase = phaseForLegacyTrack(track);
    if (phaseSeriesSlugs[phase ?? -1]) {
      page = `series/${phaseSeriesSlugs[phase!]}`;
      params.delete('track');
    }
  }
  const pagination = params.get('page');
  if (/^(?:blog|series\/[^/]+)$/.test(page) && pagination && /^\d+$/.test(pagination)) {
    const number = Number(pagination);
    params.delete('page');
    if (number > 1) page += `/page/${number}`;
  }
  const reference = params.get('ref');
  params.delete('ref');
  const query = params.toString();
  return `${page}/${query ? `?${query}` : ''}${reference ? `#${encodeURIComponent(reference)}` : ''}`;
}
