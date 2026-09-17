# Paper chat in the Laboratory

The `/lab/` page includes a reader for **Correspondences on hyperelliptic surfaces, combination theorems, and Hurwitz spaces**, Sabyasachi Mukherjee and S. Viswanathan, arXiv:2508.18711v1.

The interface has two explicit modes. Paper search is immediately available and returns manuscript passages without generating claims. Browser AI is opt-in: it downloads the registered Qwen3 4B model through WebLLM 0.2.85 (about 2.5 GB including runtime). A compatible WebGPU browser and sufficient memory are required. Once loaded, the model generates answers in a dedicated worker from retrieved source passages and bounded recent conversation. GitHub Pages serves static files only; no backend, API key, hosted inference charge, or server log of questions is used. Model assets are fetched from the official MLC AI model repositories and model-library host. Conversations are held in tab memory and can be copied or cleared. Browser model downloads may remain cached after the page closes.

## Source and limits

`lib/paper-corpus.json` contains 84 active author-TeX passages, seven manuscript sections, 64 numbered statements, 12 figure captions, cross-reference metadata, and provenance. It was derived from the verified Paper2Agent reading skill. TeX comments and the unpublished commented example are excluded; printed Figure 10 is the active Figure 10. TeX is never executed. The author authorized reuse in this site.

Page ranges locate containing sections; they are not precise per-sentence page attribution. The source PDF remains authoritative for figures, equations, and hypotheses. The model is a reading assistant and can make mathematical mistakes. Retrieval and package checks do not constitute formal verification in Lean. Quoted source and model output are rendered as text; only KaTeX creates HTML, with `trust: false`.

`lib/paper-chat.ts` performs lexical retrieval, recognizes numbered results and source cross-references, and assembles a bounded prompt. Named theorem excerpts preserve complete statements when possible. `lib/paper-chat-engine.ts` controls loading, streaming, cancellation and cleanup; worker failures unload the engine so it can be enabled again. No model is fetched before the visitor clicks Enable browser AI.

## Development and publication

Run `pnpm install --frozen-lockfile`, then `pnpm dev:pages` for development. `pnpm build:pages` runs paper retrieval tests along with the existing site checks and generates static pages. Also run TypeScript and the targeted linter when editing the reader. To inspect clean nested routes, use `pnpm preview:pages` after building.

After all source edits, run `python3 tools/package-site.py` from the repository root and include `site-source.zip` in the same commit. `python3 tools/package-site.py --check` must pass. The existing main-branch GitHub Actions workflow performs the full manuscript conservation and publication checks and deploys to GitHub Pages. Keep all existing laboratory experiments intact.

To update the manuscript corpus, rerun the Paper2Agent source-review workflow on the new paper version; recheck numbered results, active figures, references and page locators before replacing the JSON. Do not reuse old page mappings blindly.

## References

- Paper: https://arxiv.org/abs/2508.18711v1
- Paper2Agent: https://github.com/jmiao24/Paper2Agent
- WebLLM worker API: https://webllm.mlc.ai/docs/user/advanced_usage.html#using-web-workers
- Model: https://huggingface.co/mlc-ai/Qwen3-4B-q4f16_1-MLC
