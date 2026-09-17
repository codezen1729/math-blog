'use client';

/* oxlint-disable next/no-img-element -- Reviewed paper images use the static site's document base. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import katex from 'katex';
import { ArrowUp, BookOpen, Check, ChevronLeft, ChevronRight, ExternalLink, Pause, Play, Search, Sparkles, Square, Trash2 } from 'lucide-react';
import { namedReferences, readableTex, type PaperCorpus } from '@/lib/paper-chat';
import type { LibrarySearchHit, PaperLibraryEntry } from '@/lib/paper-library';
import type { PaperEngine } from '@/lib/paper-chat-engine';
import '@/app/paper-chat.css';

type Library = typeof import('@/lib/paper-library');
type Message = { id: number; role: 'user' | 'assistant'; content: string; scope: string; hits?: LibrarySearchHit[]; ai?: boolean; note?: string; refined?: string[] };
const sourceId = (messageId: number, index: number) => `paper-source-${messageId}-${index + 1}`;
const figurePath = (path: string) => path.replace(/^\/+/, '');

// Source prose and model output remain text; only restricted KaTeX creates HTML.
function PaperText({ text, corpus, hits = [], messageId, standardMath = false }: { text: string; corpus: PaperCorpus; hits?: LibrarySearchHit[]; messageId?: number; standardMath?: boolean }) {
  const macros = Object.fromEntries(Object.entries(standardMath ? {} : corpus.mathjax_macros).map(([key, value]) => [`\\${key}`, value]));
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)[^$\n]+?(?<!\\)\$)/g);
  const prose = (value: string): ReactNode => value.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const number = part.match(/^\[(\d+)\]$/)?.[1];
    const hit = number ? hits[Number(number) - 1] : undefined;
    if (!hit) return part;
    return <button type="button" className="paper-citation" key={i} aria-label={`Read source ${number}: ${hit.chunk.title}`} onClick={() => {
      const target = document.getElementById(sourceId(messageId!, Number(number) - 1));
      if (target instanceof HTMLDetailsElement) { target.open = true; target.scrollIntoView({ block: 'nearest' }); target.querySelector('summary')?.focus(); }
    }}>[{number}]</button>;
  });
  return <div className="paper-text">{parts.map((part, i) => {
    const display = part.startsWith('$$') || part.startsWith('\\[');
    const math = display || part.startsWith('\\(') || part.startsWith('$');
    if (!math) return <span key={i}>{prose(part)}</span>;
    const source = part.slice(part.startsWith('$') && !display ? 1 : 2, part.startsWith('$') && !display ? -1 : -2);
    try {
      const html = katex.renderToString(source, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, maxExpand: 200, maxSize: 15, macros: { ...macros } });
      return <span className={display ? 'paper-display-math' : 'paper-inline-math'} key={i} dangerouslySetInnerHTML={{ __html: html }} />;
    } catch { return <code key={i}>{part}</code>; }
  })}</div>;
}

function Sources({ hits, messageId, openFirst }: { hits: LibrarySearchHit[]; messageId: number; openFirst: boolean }) {
  return <div className="paper-sources" aria-label="Supporting passages">
    {hits.map(({ chunk, corpus, paperId, figureNumber, proofId, statementId }, index) => {
      const figure = corpus.figures.find(item => item.number === figureNumber);
      const precise = ['statement-start', 'proof-start', 'figure-page'].includes(chunk.page_range_scope);
      return <details key={`${paperId}:${proofId ?? statementId ?? (figureNumber ? `figure-${figureNumber}` : chunk.id)}`} id={sourceId(messageId, index)} className="paper-source" open={openFirst && index === 0 ? true : undefined}>
        <summary><span className="paper-source-number">{index + 1}</span><span>{chunk.title}<small>{precise ? (figure ? 'Figure on' : 'Starts on') : 'Section locator ·'} p. {chunk.page_start}{!precise && chunk.page_end !== chunk.page_start ? `–${chunk.page_end}` : ''} · arXiv:{corpus.paper.arxiv_id}</small></span></summary>
        <div className="paper-source-body"><a href={chunk.source_url} target="_blank" rel="noreferrer">Open the paper at page {chunk.page_start} <ExternalLink size={12} /></a>
          {figure?.asset_path && <a className="paper-source-image" href={figurePath(figure.asset_path)} target="_blank" rel="noreferrer"><img src={figurePath(figure.asset_path)} alt={figure.alt || figure.title} width={figure.width} height={figure.height} loading="lazy" /><span>Open full-size figure <ExternalLink size={11} /></span></a>}
          <PaperText text={readableTex(chunk.text, corpus)} corpus={corpus} />
          <details className="paper-original"><summary>Original author TeX</summary><pre>{chunk.text}</pre></details>
        </div>
      </details>;
    })}
  </div>;
}

function FigureGallery({ papers, onAsk, active }: { papers: PaperLibraryEntry[]; onAsk: (q: string, paperId: string) => void; active: boolean }) {
  const figures = useMemo(() => papers.flatMap(paper => paper.corpus.figures.filter(figure => figure.asset_path).map(figure => ({ paper, figure }))), [papers]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const engaged = hovered || focused;
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const gallery = useRef<HTMLElement>(null);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    const visibility = () => setVisible(!document.hidden);
    update(); visibility(); preference.addEventListener('change', update); document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? false));
    if (gallery.current) observer.observe(gallery.current);
    return () => { preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); observer.disconnect(); };
  }, [figures.length]);
  const current = figures[index % Math.max(1, figures.length)];
  const playing = !paused && !reducedMotion;
  useEffect(() => {
    if (!active || !playing || engaged || !visible || !inView || figures.length < 2) return;
    const timer = window.setInterval(() => setIndex(value => (value + 1) % figures.length), 8500);
    return () => window.clearInterval(timer);
  }, [active, playing, engaged, visible, inView, figures.length]);
  const move = (delta: number) => { setPaused(true); setIndex(value => (value + delta + figures.length) % figures.length); };
  if (!current) return <div className="paper-gallery-empty"><BookOpen size={28} /><p>Ask a question to explore the papers in this library.</p></div>;
  const { paper, figure } = current;
  // Hover/focus handlers only pause the carousel; actions remain real buttons.
  // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  return <section className="paper-gallery" ref={gallery} aria-label="Figures from the paper library" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <div className="paper-gallery-top"><span>From the papers</span><div><button type="button" onClick={() => move(-1)} aria-label="Previous figure"><ChevronLeft size={16} /></button><button type="button" aria-label={playing ? 'Pause figure slideshow' : 'Play figure slideshow'} onClick={() => { setPaused(playing); if (reducedMotion) setReducedMotion(false); }}>{playing ? <Pause size={13} /> : <Play size={13} />}</button><button type="button" onClick={() => move(1)} aria-label="Next figure"><ChevronRight size={16} /></button><span className="paper-figure-count">{index % figures.length + 1} / {figures.length}</span></div></div>
    <figure key={`${paper.id}:${figure.number}`} className={`paper-gallery-slide${playing ? ' paper-gallery-playing' : ''}`}>
      <a className="paper-gallery-image" href={figurePath(figure.asset_path!)} target="_blank" rel="noreferrer" aria-label={`Open Figure ${figure.number} at full size`}><img src={figurePath(figure.asset_path!)} alt={figure.alt || figure.title} width={figure.width} height={figure.height} decoding="async" /></a>
      <figcaption><div><span className="paper-figure-label">Figure {figure.number} <span>· p. {figure.page}</span></span><p>{figure.caption || figure.alt || figure.title}</p><span className="paper-figure-paper">{paper.corpus.paper.title}</span></div><button type="button" onClick={() => onAsk(`Explain Figure ${figure.number} and the construction it illustrates.`, paper.id)}>Ask about this figure <ArrowUp size={14} /></button></figcaption>
    </figure>
  </section>;
}

export function PaperChatbox() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [corpusError, setCorpusError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scope, setScope] = useState('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [aiState, setAiState] = useState<'off' | 'loading' | 'ready'>('off');
  const [useAi, setUseAi] = useState(true);
  const [progress, setProgress] = useState({ progress: 0, text: '' });
  const [aiError, setAiError] = useState('');
  const [copied, setCopied] = useState(false);
  const engine = useRef<PaperEngine | null>(null);
  const loader = useRef<AbortController | null>(null);
  const request = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const mounted = useRef(true);
  const asking = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const isAi = aiState === 'ready' && useAi;
  const papers = useMemo(() => library?.PAPER_LIBRARY.filter(paper => scope === 'all' || paper.id === scope) ?? [], [library, scope]);
  const corpus = papers[0]?.corpus ?? library?.PAPER_LIBRARY[0]?.corpus;

  useEffect(() => {
    let active = true;
    import('@/lib/paper-library').then(module => { if (active) { setLibrary(module); setCorpusError(false); } }).catch(() => { if (active) setCorpusError(true); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loader.current?.abort(); request.current?.abort(); void engine.current?.unload(); };
  }, []);
  useEffect(() => {
    const box = transcript.current;
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 180) box.scrollTop = box.scrollHeight;
  }, [messages]);

  async function enableAi() {
    if (loader.current || aiState !== 'off') return;
    const controller = new AbortController(); loader.current = controller;
    setAiState('loading'); setAiError(''); setProgress({ progress: 0, text: 'Checking this browser…' });
    try {
      const { loadPaperEngine } = await import('@/lib/paper-chat-engine');
      if (controller.signal.aborted) return;
      const loaded = await loadPaperEngine(value => { if (mounted.current && !controller.signal.aborted) setProgress(value); }, controller.signal);
      if (!mounted.current || controller.signal.aborted) { await loaded.unload(); return; }
      engine.current = loaded; setAiState('ready'); setUseAi(true);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) { setAiState('off'); setAiError(error instanceof Error ? error.message : 'The model could not be loaded. Source search is still available.'); }
    } finally { if (loader.current === controller) loader.current = null; }
  }

  async function ask(value: string, paperScope = scope) {
    const q = value.trim().slice(0, 1200);
    if (!library || !q || asking.current) return;
    asking.current = true;
    const inScope = messages.filter(message => message.scope === paperScope);
    const lastQuestion = inScope.filter(message => message.role === 'user').at(-1)?.content;
    const contextual = /^(?:why|how so|tell me more|explain that|explain this)\??$/i.test(q)
      || /\b(?:it|that|this|here|above|earlier|previous|condition \d+|hypothesis \d+)\b/i.test(q)
      || /^(?:and|what about|what if)\b/i.test(q)
      || /^what (?:is|does) [A-Za-z]\b(?: (?:mean|denote))?\??$/i.test(q);
    const query = lastQuestion && contextual ? `${lastQuestion} ${q}` : q;
    let hits = library.searchPaperLibrary(query, { paperId: paperScope, limit: 4 });
    const previousHits = inScope.findLast(message => message.role === 'assistant' && message.hits?.length)?.hits;
    if (!hits.length && contextual && previousHits && !namedReferences(q).length) hits = previousHits;
    const user: Message = { id: ++counter.current, role: 'user', content: q, scope: paperScope };
    const reply: Message = { id: ++counter.current, role: 'assistant', content: '', hits, scope: paperScope, ai: isAi };
    let refined: string[] = [];
    const publish = (content: string, note?: string, ai = isAi) => {
      if (mounted.current) setMessages(old => old.map(message => message.id === reply.id ? { ...reply, content, hits, note, ai, refined } : message));
    };
    const searchText = () => hits.length ? `Found ${hits.length} source${hits.length === 1 ? '' : 's'}. Read the matching passage below, or open its page in the paper.` : 'No close match found in the selected papers. Try a mathematical term, a named result such as “Theorem A”, or a figure number. You can also broaden the paper selection.';
    setQuestion(''); setCopied(false); setMessages(old => [...old.slice(-22), user, reply]);
    requestAnimationFrame(() => {
      const turn = document.getElementById(`paper-message-${user.id}`);
      if (turn && transcript.current) transcript.current.scrollTop += turn.getBoundingClientRect().top - transcript.current.getBoundingClientRect().top;
    });
    if (!isAi || !engine.current || (!hits.length && namedReferences(q).length > 0)) { publish(searchText(), undefined, false); asking.current = false; input.current?.focus(); return; }
    const controller = new AbortController(); request.current = controller;
    const currentEngine = engine.current;
    let timedOut = false;
    const deadline = window.setTimeout(() => { timedOut = true; controller.abort(); currentEngine.interrupt(); }, 180000);
    const needsRefinement = !hits.some(hit => hit.statementId || hit.proofId || hit.figureNumber);
    setBusy(true); setPhase(needsRefinement ? 'Refining the search…' : 'Reading the matching sources…');
    let answerText = '';
    let answerNote: string | undefined;
    let finalAi = true;
    try {
      try {
        if (needsRefinement) refined = await currentEngine.refineQuery(query, library.getSearchConcepts(paperScope), controller.signal);
        if (controller.signal.aborted) return;
        if (refined.length) hits = library.searchPaperLibrary(query, { paperId: paperScope, limit: 4, refinedTerms: refined });
        publish('');
      } catch (error) { if (controller.signal.aborted || !currentEngine.loaded) throw error; }
      if (!hits.length) { finalAi = false; answerText = searchText(); publish(answerText, undefined, false); return; }
      setPhase('Reading the matching sources…');
      const previous = inScope.filter(message => message.role === 'user' || message.ai).map(({ role, content }) => ({ role, content }));
      const prompt = library.buildLibraryMessages(q, hits, previous);
      for await (const delta of currentEngine.answer(prompt, controller.signal)) {
        if (!mounted.current || controller.signal.aborted) break;
        answerText += delta; publish(answerText);
      }
      if (!controller.signal.aborted && answerText.trim()) {
        const audit = library.validateAnswerCitations(answerText, hits, prompt);
        if (audit.invalidNumbers.length || !audit.hasValidCitations) {
          answerText = 'The AI response did not provide reliable source references, so it has been withheld. The matching passages are available below.';
          answerNote = 'Try a more specific question, or read the original source.';
        } else answerText = audit.text;
      } else if (!controller.signal.aborted) answerNote = 'The model returned no answer. Read the supporting passages below.';
    } catch (error) {
      answerText = searchText(); finalAi = false;
      if (!controller.signal.aborted) answerNote = `The AI answer could not finish. ${error instanceof Error ? error.message : 'Please try again.'} Source search remains available.`;
    } finally {
      window.clearTimeout(deadline);
      if (controller.signal.aborted) { answerText = timedOut ? searchText() : ''; finalAi = false; answerNote = timedOut ? 'Browser AI took too long on this device. Showing the matching sources instead.' : 'Stopped. The matching sources remain available.'; }
      if (mounted.current) {
        publish(answerText, answerNote, finalAi); setBusy(false); setPhase(''); input.current?.focus();
        if (!currentEngine.loaded) { engine.current = null; setAiState('off'); setAiError('The model was unloaded. Enable browser AI again, or continue with source search.'); }
      }
      asking.current = false;
      if (request.current === controller) request.current = null;
    }
  }

  function stop() { request.current?.abort(); engine.current?.interrupt(); }
  async function copyConversation() {
    try {
      await navigator.clipboard.writeText(messages.map(message => `${message.role === 'user' ? 'You' : message.ai ? 'AI reading assistant' : 'Source search'}: ${message.content}${message.note ? `\n${message.note}` : ''}${message.hits?.length ? '\nSources:\n' + message.hits.map((hit, index) => `[${index + 1}] ${hit.corpus.paper.title} — ${hit.chunk.title}: ${hit.chunk.source_url}`).join('\n') : ''}`).join('\n\n'));
      setCopied(true);
    } catch { setCopied(false); setAiError('Copy is unavailable here. Select and copy the conversation text instead.'); }
  }

  return <section id="paper-chat" className="paper-chat" aria-labelledby="paper-chat-title">
    <header className="paper-chat-heading"><div><h2 id="paper-chat-title">Math Chatbox</h2><p>Ask questions. Explore the papers. Find the source.</p></div><span className="paper-library-count"><BookOpen size={15} />{library ? `${library.PAPER_LIBRARY.length} paper${library.PAPER_LIBRARY.length === 1 ? '' : 's'} in the library` : 'Loading library'}</span></header>
    <div className="paper-chat-layout">
      <aside className="paper-chat-about" aria-label="Paper library and AI settings">
        <label className="paper-library-label" htmlFor="paper-scope">Search in</label>
        <select id="paper-scope" value={scope} disabled={!library || busy} onChange={event => setScope(event.target.value)}><option value="all">All papers</option>{library?.PAPER_LIBRARY.map(paper => <option key={paper.id} value={paper.id}>{paper.corpus.paper.title}</option>)}</select>
        <div className="paper-library-list">{papers.map(paper => <details className="paper-library-item" key={paper.id} open={papers.length === 1}><summary>{paper.corpus.paper.title}</summary><p className="paper-authors">{paper.corpus.paper.authors.join(' · ')}</p><p className="paper-edition">arXiv:{paper.corpus.paper.arxiv_id} · {paper.corpus.paper.version}<br />{paper.corpus.paper.page_count} pages · {paper.corpus.paper.figure_count} figures</p><a href={paper.corpus.paper.abstract_url} target="_blank" rel="noreferrer">Read the paper <ExternalLink size={12} /></a></details>)}</div>
        <div className="paper-engine-settings">
          <strong><Sparkles size={14} />Browser AI</strong>
          {aiState === 'ready' ? <label className="paper-ai-toggle"><input type="checkbox" checked={useAi} disabled={busy} onChange={event => setUseAi(event.target.checked)} /> Refine searches & explain sources</label> : <p>Find passages instantly. Enable AI to refine your search and explain the matching sources.</p>}
          {aiState === 'off' && <><button type="button" className="paper-enable" onClick={enableAi}><Sparkles size={14} /> Enable browser AI</button><small>About 2.5 GB on first use. Requires WebGPU and several GB of free GPU memory. No API key.</small></>}
          {aiState === 'loading' && <div className="paper-model-progress"><progress max="1" value={Math.max(0, Math.min(1, progress.progress))} aria-label="AI model download" /><output>{progress.text}</output><button type="button" onClick={() => { loader.current?.abort(); loader.current = null; setAiState('off'); }}>Cancel download</button></div>}
          {aiState === 'ready' && <><small>Qwen3 · runs on your device.<br />Questions stay in this tab.</small><button type="button" className="paper-unload" disabled={busy} onClick={() => { const loaded = engine.current; engine.current = null; setAiState('off'); void loaded?.unload(); }}>Unload AI to free memory</button></>}
          {aiError && <p role="alert" className="paper-error">{aiError}</p>}
        </div>
        <details className="paper-about-details"><summary>How this works</summary><p>Math Chatbox searches reviewed paper sources prepared with Paper2Agent. Each result identifies its paper, statement or figure, and a PDF page.</p><p>Browser AI uses these sources to refine searches and draft explanations. AI can make mistakes; check the original hypotheses and proofs.</p><p>The model downloads from MLC AI on Hugging Face only when enabled. Conversations stay in this tab; model files may be cached by your browser.</p><a href="https://github.com/jmiao24/Paper2Agent" target="_blank" rel="noreferrer">Paper2Agent <ExternalLink size={11} /></a></details>
      </aside>
      <div className="paper-conversation">
        <div className="paper-conversation-bar"><span><span className={`paper-status-dot${isAi ? ' paper-status-ai' : ''}`} />{isAi ? 'AI + verified paper sources' : 'Source search'}</span><div>{messages.length > 0 && <><button type="button" disabled={busy} onClick={copyConversation}>{copied ? <><Check size={12} /> Copied</> : 'Copy chat'}</button><button type="button" disabled={busy} onClick={() => { setMessages([]); setCopied(false); input.current?.focus(); }} aria-label="Clear conversation"><Trash2 size={14} /></button></>}</div></div>
        {/* This scrollable conversation is focusable for keyboard scrolling. */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <section className={`paper-transcript${!messages.length ? ' paper-transcript-idle' : ''}`} ref={transcript} aria-label="Paper conversation" aria-busy={busy} tabIndex={0}>
          {messages.length === 0 && <><FigureGallery papers={papers} active={!question.trim()} onAsk={(q, paperId) => { setScope(paperId); void ask(q, paperId); }} /><div className="paper-prompts">{(corpus?.suggested_questions ?? []).slice(0, 2).map(prompt => <button type="button" key={prompt} disabled={!library} onClick={() => void ask(prompt)}>{prompt}<ArrowUp size={13} /></button>)}</div></>}
          {corpus && messages.map(message => <article className={`paper-message paper-message-${message.role}`} key={message.id} id={`paper-message-${message.id}`}><p className="paper-message-label">{message.role === 'user' ? 'You' : message.ai ? 'AI reading assistant' : 'From the papers'}{message.role === 'user' && message.scope !== 'all' && <span> · arXiv:{library?.getPaper(message.scope)?.corpus.paper.arxiv_id}</span>}</p><PaperText text={message.content} corpus={message.hits?.[0]?.corpus ?? corpus} hits={message.hits} messageId={message.id} standardMath={Boolean(message.ai && new Set(message.hits?.map(hit => hit.paperId)).size > 1)} />{busy && !message.content && message.id === messages.at(-1)?.id && <p className="paper-thinking">{phase}</p>}{message.note && <p className="paper-message-note">{message.note}</p>}{message.refined?.length ? <details className="paper-search-terms"><summary>Search terms</summary>{message.refined.join(' · ')}</details> : null}{message.hits?.length ? <Sources hits={message.hits} messageId={message.id} openFirst={!message.ai} /> : null}</article>)}
        </section>
        <form className="paper-compose" onSubmit={event => { event.preventDefault(); void ask(question); }}>
          {corpusError && <p role="alert" className="paper-error">The library could not load. <button type="button" onClick={() => { setCorpusError(false); setAttempt(value => value + 1); }}>Try again</button></p>}
          <label className="sr-only" htmlFor="paper-question">Ask a question about the papers</label>
          <div className="paper-input-row"><textarea id="paper-question" ref={input} rows={2} maxLength={1200} value={question} disabled={!library || busy} placeholder={library ? 'Ask about a theorem, a proof, a figure…' : 'Loading the paper library…'} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question); } }} />{busy ? <button type="button" className="paper-send" onClick={stop} aria-label="Stop answer"><Square size={17} /></button> : <button type="submit" className="paper-send" disabled={!library || !question.trim()} aria-label={isAi ? 'Ask Math Chatbox' : 'Find passages'}>{isAi ? <ArrowUp size={20} /> : <Search size={19} />}</button>}</div>
          <div className="paper-compose-note"><span>{isAi ? 'AI explanations · check the cited sources' : 'Source search is ready · enable AI for explanations'}</span><span>Enter to send · Shift + Enter for a new line</span></div>
          <output className="sr-only" aria-live="polite">{busy ? phase : messages.length ? 'Answer ready' : library ? 'Library ready' : 'Loading library'}</output>
        </form>
      </div>
    </div>
  </section>;
}
