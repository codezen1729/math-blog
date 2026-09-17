/** Created only by the visitor's explicit “Enable AI” action. */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// The official worker handler owns model downloads, WebGPU memory, and inference.
// Conversation messages stay in this worker; there is no hosted chat API.
// https://webllm.mlc.ai/docs/user/advanced_usage.html#using-web-workers
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => handler.onmessage(event);
