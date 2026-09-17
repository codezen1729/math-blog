/**
 * Optional, local inference for the paper reader. Importing this module does not
 * fetch WebLLM or model weights. Call loadPaperEngine only after the visitor opts
 * in to the model download; ordinary paper search never calls this adapter.
 *
 * WebLLM's documented worker API keeps inference off the browser's UI thread:
 * https://webllm.mlc.ai/docs/user/advanced_usage.html#using-web-workers
 */
import type { ChatCompletionChunk } from '@mlc-ai/web-llm';
import { buildRefinementMessages, parseRefinedQuery } from './paper-chat.ts';

export const PAPER_MODEL_ID = 'Qwen3-4B-q4f16_1-MLC';
export const PAPER_MODEL_LABEL = 'Qwen3 4B';
export const PAPER_CONTEXT_TOKENS = 8192;
export const PAPER_OUTPUT_TOKENS = 900;

export type PaperChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type PaperEngineProgress = { progress: number; text: string };

export interface PaperEngine {
  readonly modelId: string;
  /** Becomes false after unloading, a crashed worker, or a forced cancellation. */
  readonly loaded: boolean;
  /** Yields text deltas, not the accumulated answer. Aborting throws AbortError. */
  answer(messages: PaperChatMessage[], signal?: AbortSignal, purpose?: 'answer' | 'refinement'): AsyncIterable<string>;
  /** Selects existing catalog phrases; malformed/unsupported suggestions become []. */
  refineQuery(question: string, concepts: string[], signal?: AbortSignal): Promise<string[]>;
  interrupt(): void;
  /** Releases the model and terminates its worker; cached downloads are retained. */
  unload(): Promise<void>;
}

function cancellation(message = 'The AI request was stopped.'): DOMException {
  return new DOMException(message, 'AbortError');
}

function checkAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw cancellation();
}

/**
 * The caller owns this engine and should unload it on unmount. The optional
 * signal cancels loading only; use answer's signal or interrupt for generation.
 * An unsupported browser fails before downloading the inference runtime.
 */
export async function loadPaperEngine(
  onProgress: (report: PaperEngineProgress) => void,
  signal?: AbortSignal,
): Promise<PaperEngine> {
  checkAborted(signal);
  if (typeof navigator === 'undefined' || typeof Worker === 'undefined') {
    throw new Error('Browser AI is unavailable here. You can still search and read the paper.');
  }
  const gpu = (navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<{ features: { has(feature: string): boolean } } | null> };
  }).gpu;
  if (!gpu) {
    throw new Error('Browser AI needs WebGPU. Try an up-to-date browser with hardware acceleration enabled, or use the paper search.');
  }
  const adapter = await gpu.requestAdapter();
  checkAborted(signal);
  if (!adapter) {
    throw new Error('The browser could not access a compatible GPU. Paper search still works without AI.');
  }
  // Both variants are registered by WebLLM; f32 supports GPUs without shader-f16.
  const modelId = adapter.features.has('shader-f16')
    ? PAPER_MODEL_ID
    : 'Qwen3-4B-q4f32_1-MLC';
  onProgress({ progress: 0, text: 'Preparing browser AI…' });
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
  checkAborted(signal);
  const worker = new Worker(new URL('./paper-chat.worker.ts', import.meta.url), { type: 'module' });
  let disposed = false;
  let unloading = false;
  let activeStop: (() => void) | undefined;
  let rejectClosed!: (reason: Error) => void;
  const closed = new Promise<never>((_resolve, reject) => { rejectClosed = reject; });
  // Worker failure can happen while idle, when no race is currently listening.
  void closed.catch(() => undefined);
  const dispose = (reason: Error) => {
    if (disposed) return;
    disposed = true;
    worker.removeEventListener('error', workerFailed);
    worker.removeEventListener('messageerror', workerFailed);
    signal?.removeEventListener('abort', loadAborted);
    worker.terminate();
    rejectClosed(reason);
  };
  const workerFailed = () => dispose(new Error('Browser AI stopped unexpectedly. Enable it again to retry, or continue with paper search.'));
  const loadAborted = () => dispose(cancellation('The model download was cancelled.'));
  worker.addEventListener('error', workerFailed);
  worker.addEventListener('messageerror', workerFailed);
  signal?.addEventListener('abort', loadAborted, { once: true });
  // Race every worker request against termination: WebLLM's proxy cannot itself
  // reject pending requests when the Worker is terminated or its script crashes.
  const live = <T>(operation: Promise<T>): Promise<T> => Promise.race([operation, closed]);
  let engine: Awaited<ReturnType<typeof CreateWebWorkerMLCEngine>>;
  try {
    checkAborted(signal);
    engine = await live(CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: (report) => {
        if (!disposed) onProgress({ progress: Math.max(0, Math.min(1, report.progress)), text: report.text });
      },
    }, {
      context_window_size: PAPER_CONTEXT_TOKENS,
    }));
    checkAborted(signal);
  } catch (error) {
    const reason = error instanceof Error ? error : new Error(String(error));
    dispose(reason);
    if (reason.name === 'AbortError') throw reason;
    throw new Error('Could not load browser AI. Check your connection and available GPU memory, then try again. Paper search remains available.', { cause: reason });
  } finally {
    signal?.removeEventListener('abort', loadAborted);
  }

  return {
    modelId,
    get loaded() { return !disposed && !unloading; },
    async *answer(messages, answerSignal, purpose = 'answer') {
      checkAborted(answerSignal);
      if (disposed || unloading) throw new Error('Enable browser AI again before asking for an AI explanation.');
      if (activeStop) throw new Error('Wait for the current answer to finish, or stop it first.');
      if (!messages.length || messages.at(-1)?.role !== 'user') {
        throw new Error('An AI request must finish with a question.');
      }
      let stopped = false;
      let completed = false;
      let stopTimer: ReturnType<typeof setTimeout> | undefined;
      let iterator: AsyncIterator<ChatCompletionChunk> | undefined;
      // WebLLM 0.2.85 inserts this literal prefix when thinking is disabled and
      // includes it in the first text chunk. Suppress that framework-inserted
      // empty block, including if chunk boundaries ever split the prefix.
      const emptyThinkingPrefix = '<think>\n\n</think>\n\n';
      let initialText = '';
      let checkingPrefix = true;
      const stop = () => {
        if (stopped || disposed) return;
        stopped = true;
        engine.interruptGenerate();
        // Usually interruption finishes at the next token. A stalled GPU must
        // not leave the UI waiting forever; the caller can inspect `loaded`.
        stopTimer = setTimeout(() => dispose(cancellation('AI was stopped and unloaded. Enable it again to continue.')), 5000);
      };
      activeStop = stop;
      answerSignal?.addEventListener('abort', stop, { once: true });
      try {
        // The caller supplies a bounded source-based prompt and recent history.
        // WebLLM checks the actual tokenizer budget; never silently truncate the
        // prompt here because that could remove hypotheses or source evidence.
        const chunks = await live(engine.chat.completions.create({
          messages,
          stream: true,
          max_tokens: purpose === 'refinement' ? 100 : PAPER_OUTPUT_TOKENS,
          temperature: purpose === 'refinement' ? 0 : 0.2,
          top_p: 0.9,
          // Supported for Qwen3 by the pinned WebLLM request API. This is the
          // hard switch, independent of any /think text in a reader's question.
          extra_body: { enable_thinking: false },
        }));
        iterator = chunks[Symbol.asyncIterator]();
        while (true) {
          if (stopped) throw cancellation();
          const next = await live(iterator.next());
          if (stopped) throw cancellation();
          if (next.done) { completed = true; break; }
          const delta = next.value.choices[0]?.delta.content;
          if (delta) {
            if (checkingPrefix) {
              initialText += delta;
              if (emptyThinkingPrefix.startsWith(initialText)) continue;
              checkingPrefix = false;
              const visible = initialText.startsWith(emptyThinkingPrefix)
                ? initialText.slice(emptyThinkingPrefix.length)
                : initialText;
              if (visible) yield visible;
            } else {
              yield delta;
            }
          }
        }
      } catch (error) {
        // A rejected worker request can represent a lost GPU without emitting
        // Worker.onerror. Require a fresh engine instead of leaving a false
        // "ready" state with a permanently failed model.
        if (!stopped && !answerSignal?.aborted) {
          dispose(error instanceof Error ? error : new Error(String(error)));
        }
        throw error;
      } finally {
        answerSignal?.removeEventListener('abort', stop);
        if (!completed && !disposed) {
          stop();
          // In the pinned WebLLM 0.2.85 release, iterator.return only closes the
          // proxy generator. Drain the interrupted stream to its final `done`
          // so the worker also releases the generation lock. Do not expose the
          // trailing tokens after a stop. The timer bounds a stalled GPU.
          if (iterator) {
            let drained = false;
            try {
              for (let tail = 0; tail < 4 && !disposed; tail++) {
                engine.interruptGenerate();
                if ((await live(iterator.next())).done) { drained = true; break; }
              }
            } catch {
              // A failed stream cannot safely be reused.
            }
            if (!drained) dispose(cancellation('AI was stopped and unloaded. Enable it again to continue.'));
          } else {
            dispose(cancellation());
          }
        }
        if (stopTimer !== undefined) clearTimeout(stopTimer);
        activeStop = undefined;
      }
    },
    async refineQuery(this: PaperEngine, question, concepts, refinementSignal) {
      checkAborted(refinementSignal);
      if (!concepts.length || !question.trim()) return [];
      let output = '';
      for await (const delta of this.answer(buildRefinementMessages(question, concepts), refinementSignal, 'refinement')) {
        output += delta;
        if (output.length > 800) return [];
      }
      checkAborted(refinementSignal);
      return parseRefinedQuery(output, concepts);
    },
    interrupt() { activeStop?.(); },
    async unload() {
      if (disposed || unloading) return;
      unloading = true;
      activeStop?.();
      const timer = setTimeout(() => dispose(cancellation('Browser AI was unloaded.')), 2500);
      try {
        await live(engine.unload());
      } catch {
        // Termination below also releases resources when the GPU cannot respond.
      } finally {
        clearTimeout(timer);
        dispose(cancellation('Browser AI was unloaded.'));
      }
    },
  };
}
