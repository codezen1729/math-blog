'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import katex from 'katex';
import { ArrowUp, BookOpen, Check, ExternalLink, MessageCircle, Search, Sparkles, Square, Trash2 } from 'lucide-react';
import { buildPaperMessages, readableTex, searchPaper, type PaperCorpus, type SearchHit } from '@/lib/paper-chat';
import type { PaperEngine } from '@/lib/paper-chat-engine';
import '@/app/paper-chat.css';

type Message = { id: number; role: 'user' | 'assistant'; content: string; hits?: SearchHit[]; ai?: boolean; note?: string };
const prompts = ['What do Theorems A and B say?', 'What is a weak B-involution?', 'How does the welding graph work?', 'Why is the Hurwitz-space map injective?'];

// Only KaTeX creates HTML; all model prose and source text stay React text nodes.
function PaperText({ text, corpus, hits = [] }: { text: string; corpus: PaperCorpus; hits?: SearchHit[] }) {
  const macros = Object.fromEntries(Object.entries(corpus.mathjax_macros).map(([key, value]) => [`\\${key}`, value]));
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)[^$\n]+?(?<!\\)\$)/g);
  const prose = (value: string): ReactNode => value.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const number = part.match(/^\[(\d+)\]$/)?.[1];
    const hit = number ? hits[Number(number) - 1] : undefined;
    return hit ? <a key={i} href={hit.chunk.source_url} target="_blank" rel="noreferrer" title={hit.chunk.title}>[{number}]</a> : part;
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

function Sources({ hits, corpus }: { hits: SearchHit[]; corpus: PaperCorpus }) {
  return <div className="paper-sources" aria-label="Supporting passages">
    {hits.map(({ chunk }, index) => <details key={chunk.id} className="paper-source">
      <summary><span className="paper-source-number">{index + 1}</span><span>{chunk.title}<small>Section locator · p. {chunk.page_start}{chunk.page_end !== chunk.page_start ? `–${chunk.page_end}` : ''}</small></span></summary>
      <div className="paper-source-body"><a href={chunk.source_url} target="_blank" rel="noreferrer">Open this section in the PDF <ExternalLink size={12} /></a>
        <PaperText text={readableTex(chunk.text, corpus)} corpus={corpus} />
        <details className="paper-original"><summary>Original author TeX</summary><pre>{chunk.text}</pre></details>
      </div>
    </details>)}
  </div>;
}

export function PaperChatbox() {
  const [corpus, setCorpus] = useState<PaperCorpus | null>(null);
  const [corpusError, setCorpusError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
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
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const isAi = aiState === 'ready' && useAi;

  useEffect(() => {
    let active = true;
    import('@/lib/paper-corpus.json').then(module => { if (active) setCorpus(module.default as PaperCorpus); }).catch(() => { if (active) setCorpusError(true); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; loader.current?.abort(); request.current?.abort(); void engine.current?.unload(); };
  }, []);
  useEffect(() => {
    const box = transcript.current;
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 220) box.scrollTop = box.scrollHeight;
  }, [messages]);

  async function enableAi() {
    if (aiState !== 'off') return;
    const controller = new AbortController();
    loader.current = controller;
    setAiState('loading'); setAiError(''); setProgress({ progress: 0, text: 'Checking this browser…' });
    try {
      const { loadPaperEngine } = await import('@/lib/paper-chat-engine');
      if (controller.signal.aborted) return;
      const loaded = await loadPaperEngine(value => { if (mounted.current && !controller.signal.aborted) setProgress(value); }, controller.signal);
      if (!mounted.current || controller.signal.aborted) { await loaded.unload(); return; }
      engine.current = loaded; setAiState('ready'); setUseAi(true);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) { setAiState('off'); setAiError(error instanceof Error ? error.message : 'The model could not be loaded. You can still search the paper.'); }
    }
  }

  async function ask(value: string) {
    const q = value.trim();
    if (!corpus || !q || busy) return;
    const lastQuestion = messages.filter(message => message.role === 'user').at(-1)?.content;
    // Short follow-ups need the preceding topic; standalone questions search on their own.
    const contextual = /^(?:why|how so|tell me more|explain that|explain this)\??$/i.test(q)
      || /\b(?:it|that|this|here|above|earlier|previous|condition \d+|hypothesis \d+)\b/i.test(q)
      || /^(?:and|what about|what if)\b/i.test(q)
      || /^what (?:is|does) [A-Za-z]\b(?: (?:mean|denote))?\??$/i.test(q);
    const query = lastQuestion && contextual ? `${lastQuestion} ${q}` : q;
    const retrieved = searchPaper(corpus, query, 4);
    const previousHits = messages.findLast(message => message.role === 'assistant' && message.hits?.length)?.hits;
    const hits = retrieved.length ? retrieved : contextual && previousHits ? previousHits : [];
    const user: Message = { id: ++counter.current, role: 'user', content: q };
    const reply: Message = { id: ++counter.current, role: 'assistant', content: '', hits, ai: isAi };
    setQuestion(''); setCopied(false);
    if (!isAi || !hits.length || !engine.current) {
      const searchReply = { ...reply, ai: false, content: hits.length ? 'Here are the closest passages in the paper. Open a passage to read it, or follow its PDF link to check the full statement and proof.' : 'I couldn’t find a close match in this paper. Try a named result, a section number, or a term such as “weak B-involution”, “welding graph”, or “Hurwitz space”.' };
      setMessages(old => [...old.slice(-22), user, searchReply]);
      requestAnimationFrame(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; });
      input.current?.focus(); return;
    }
    const controller = new AbortController(); request.current = controller;
    const previous = messages.filter(message => message.role === 'user' || message.ai).map(({ role, content }) => ({ role, content }));
    setMessages(old => [...old.slice(-22), user, reply]); setBusy(true);
    requestAnimationFrame(() => { if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight; });
    let answerText = '';
    let answerNote: string | undefined;
    const publishReply = (content: string, note?: string) => setMessages(old => old.map(message => message.id === reply.id ? { ...reply, content, note } : message));
    try {
      const prompt = buildPaperMessages(corpus, q, hits, previous);
      for await (const delta of engine.current.answer(prompt, controller.signal)) {
        if (!mounted.current || controller.signal.aborted) break;
        answerText += delta;
        publishReply(answerText);
      }
      if (!answerText.trim() && !controller.signal.aborted) answerNote = 'The model returned no answer. The supporting passages are available below.';
    } catch (error) {
      if (!controller.signal.aborted) answerNote = `The AI answer could not finish. ${error instanceof Error ? error.message : 'Please try again.'} You can still read the passages below.`;
    } finally {
      if (controller.signal.aborted) answerNote = 'Answer stopped. The supporting passages remain available.';
      if (mounted.current) {
        publishReply(answerText, answerNote); setBusy(false); input.current?.focus();
        if (engine.current && !engine.current.loaded) { engine.current = null; setAiState('off'); setAiError('The AI model was unloaded. Enable it again to continue, or use paper search.'); }
      }
      if (request.current === controller) request.current = null;
    }
  }

  function stop() { request.current?.abort(); engine.current?.interrupt(); }
  async function copyConversation() {
    try {
      await navigator.clipboard.writeText(messages.map(message => `${message.role === 'user' ? 'You' : message.ai ? 'AI reading assistant' : 'Paper search'}: ${message.content}${message.note ? `\n${message.note}` : ''}${message.hits?.length ? '\nSources:\n' + message.hits.map((hit, index) => `[${index + 1}] ${hit.chunk.title}: ${hit.chunk.source_url}`).join('\n') : ''}`).join('\n\n'));
      setCopied(true);
    } catch { setCopied(false); setAiError('Copy is unavailable in this browser. You can select and copy the conversation text.'); }
  }

  return <section id="paper-chat" className="paper-chat" aria-labelledby="paper-chat-title">
    <header className="paper-chat-heading"><div><p className="paper-eyebrow"><MessageCircle size={14} /> A paper, in conversation</p><h2 id="paper-chat-title">Ask the paper</h2></div><a href="https://arxiv.org/abs/2508.18711v1" target="_blank" rel="noreferrer">Read on arXiv <ExternalLink size={14} /></a></header>
    <div className="paper-chat-layout">
      <aside className="paper-chat-about">
        <BookOpen size={25} strokeWidth={1.4} />
        <h3>Correspondences on hyperelliptic surfaces, combination theorems, and Hurwitz spaces</h3>
        <p className="paper-authors">Sabyasachi Mukherjee<br />S. Viswanathan</p>
        <p className="paper-edition">arXiv:2508.18711 · v1<br />48 pages · August 2025</p>
        <div className="paper-engine-settings">
          <strong>{aiState === 'ready' ? 'AI is ready in this browser' : 'Bring the paper into conversation'}</strong>
          {aiState === 'ready' ? <label className="paper-ai-toggle"><input type="checkbox" checked={useAi} disabled={busy} onChange={event => setUseAi(event.target.checked)} /> Generate AI explanations</label> : <p>Search the source now, or enable an AI model for explanations and follow-up questions.</p>}
          {aiState === 'off' && <><button type="button" className="paper-enable" onClick={enableAi}><Sparkles size={14} /> Enable browser AI</button><small>First use downloads about 2.5 GB. Requires WebGPU and several GB of free GPU memory. Runs on your device; no API key.</small></>}
          {aiState === 'loading' && <div className="paper-model-progress"><progress max="1" value={Math.max(0, Math.min(1, progress.progress))} aria-label="AI model download" /><output>{progress.text}</output><button type="button" onClick={() => { loader.current?.abort(); setAiState('off'); }}>Cancel download</button></div>}
          {aiState === 'ready' && <small>Qwen3 · 4B parameters<br />Questions and answers stay in this tab.</small>}
          {aiError && <p role="alert" className="paper-error">{aiError}</p>}
        </div>
        <details className="paper-about-details"><summary>About this reader</summary><p>Built from the paper’s author TeX using Paper2Agent. Search is available without AI. The optional model downloads from MLC AI on Hugging Face; your questions are processed on your device.</p><p>AI explanations may miss hypotheses. Check the original statements and proofs. This is a reading aid, not a formal verification in Lean.</p><p>Passage page ranges locate the containing section. Figures are available in the linked PDF. Your conversation lasts only while this page is open.</p><a href="https://github.com/jmiao24/Paper2Agent" target="_blank" rel="noreferrer">About Paper2Agent <ExternalLink size={11} /></a></details>
      </aside>
      <div className="paper-conversation">
        <div className="paper-conversation-bar"><span><span className={`paper-status-dot${isAi ? ' paper-status-ai' : ''}`} />{isAi ? 'AI + paper sources' : 'Paper search'}</span><div>{messages.length > 0 && <><button type="button" disabled={busy} onClick={copyConversation}>{copied ? <><Check size={12} /> Copied</> : 'Copy chat'}</button><button type="button" disabled={busy} onClick={() => { setMessages([]); setCopied(false); input.current?.focus(); }} aria-label="Clear conversation"><Trash2 size={14} /></button></>}</div></div>
        <section className="paper-transcript" ref={transcript} aria-label="Paper conversation" aria-busy={busy}>
          {messages.length === 0 && <div className="paper-welcome"><span className="paper-welcome-mark">↔</span><h3>From a question<br />to a statement, to a proof.</h3><p>Explore the constructions, follow a theorem’s hypotheses, or trace an idea through the paper. Every result starts with a source passage.</p><div className="paper-prompts">{prompts.map(prompt => <button type="button" key={prompt} disabled={!corpus} onClick={() => void ask(prompt)}>{prompt}<ArrowUp size={13} /></button>)}</div></div>}
          {corpus && messages.map(message => <article className={`paper-message paper-message-${message.role}`} key={message.id}><p className="paper-message-label">{message.role === 'user' ? 'You' : message.ai ? 'AI reading assistant' : 'From the paper'}</p><PaperText text={message.content} corpus={corpus} hits={message.hits} />{busy && !message.content && message.id === messages.at(-1)?.id && <p className="paper-thinking">Reading the selected passages…</p>}{message.note && <p className="paper-message-note">{message.note}</p>}{message.hits?.length ? <Sources hits={message.hits} corpus={corpus} /> : null}</article>)}
        </section>
        <form className="paper-compose" onSubmit={event => { event.preventDefault(); void ask(question); }}>
          {corpusError && <p role="alert" className="paper-error">The paper could not load. <button type="button" onClick={() => { setCorpusError(false); setAttempt(value => value + 1); }}>Try again</button></p>}
          <label className="sr-only" htmlFor="paper-question">Ask a question about the paper</label>
          <div className="paper-input-row"><textarea id="paper-question" ref={input} rows={2} maxLength={1200} value={question} disabled={!corpus || busy} placeholder={corpus ? 'Ask about a theorem, construction, or example…' : 'Loading the paper…'} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(question); } }} />{busy ? <button type="button" className="paper-send" onClick={stop} aria-label="Stop answer"><Square size={17} /></button> : <button type="submit" className="paper-send" disabled={!corpus || !question.trim()} aria-label={isAi ? 'Ask the paper' : 'Find passages'}>{isAi ? <ArrowUp size={20} /> : <Search size={19} />}</button>}</div>
          <div className="paper-compose-note"><span>{isAi ? 'AI can make mistakes. Check the linked paper.' : 'Source search · enable AI for generated explanations'}</span><span>Enter to send</span></div>
          <output className="sr-only">{busy ? 'Generating an answer' : messages.length ? 'Answer ready' : corpus ? 'Paper ready' : 'Loading paper'}</output>
        </form>
      </div>
    </div>
  </section>;
}
