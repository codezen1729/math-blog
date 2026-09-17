# Math Chatbox

The Laboratory hosts a growing library of reviewed papers. It currently contains **Correspondences on hyperelliptic surfaces, combination theorems, and Hurwitz spaces**, Sabyasachi Mukherjee and S. Viswanathan, arXiv:2508.18711v1.

## Reader experience

The idle chat displays the paper’s original figures, with captions and a button to ask about each figure. The slideshow advances every 8.5 seconds, pauses while typing, hovering, focusing, off screen, or in a hidden tab, and respects reduced-motion preferences. Previous/next and pause/play controls are available. The images retain their original proportions and can open at full size.

Visitors can search all registered papers or choose one. Search immediately returns matching source text without requiring AI, including complete named statements, proofs, definitions and figure captions where available. Figure results retain the surrounding construction. Every result identifies its paper and PDF destination. Clicking an AI citation opens the corresponding source passage in the conversation. Exact starting-page locators are distinguished from broader section ranges. Original author TeX remains available.

Browser AI is optional and enabled by the visitor: Qwen3 4B through WebLLM 0.2.85 requires WebGPU, several GB of free GPU memory, and approximately 2.5 GB of model/runtime downloads on first use. The model runs in a worker. For questions without an exact statement or figure match, it first refines the search by selecting at most three concepts from the actual paper catalog, then explains retrieved source passages with numbered citations. Original named matches survive refinement. Generated concepts cannot invent documents, source text, statement numbers or links. Missing named results do not fall back to unrelated passages.

A completed AI response with nonexistent citations or no valid source citation is withheld; the original passages remain available. Citation checks preserve mathematical intervals and notation. This validates reference existence, not mathematical correctness or whether every claim follows from the citation. AI explanations can still be wrong. This is not a formal verification in Lean.

GitHub Pages serves static files. There is no hosted inference backend, API key or paid inference account. Model assets download from official MLC AI repositories/hosts only after the visitor opts in. Conversation text stays in tab memory, and model downloads may be cached. Visitors can stop a request, copy or clear the conversation, disable AI explanations, and unload AI to free memory. Failed workers can be enabled again; source search remains available. A three-minute request limit ends stalled inference and preserves the matching passages. Exact statement and figure matches skip AI query refinement to avoid unnecessary latency.

## Relationship to Paper2Agent

Paper2Agent is the source preparation and review workflow. The browser searches its verified reading-package content and uses grounded prompts; it does not execute a desktop coding-agent skill or shell commands. Paper content and user questions are treated as data. Source and generated prose render as text; only KaTeX creates HTML, with trust disabled.

`lib/paper-corpus.json` includes 84 original active author-TeX passages, 64 complete statements, 25 complete proof excerpts, 12 figures and captions, custom notation and reference maps. All 89 statement/proof starting-page headings were independently matched to preserved PDF evidence. The 12 images in `public/papers/2508.18711v1/` are byte-for-byte copies of the previously reviewed Paper2Agent assets. The unpublished commented example is excluded; the active Figure 10 is preserved. The author authorized reuse.

A starting-page link does not assert that a proof ends on that page. Other passage locators are section ranges. The source PDF remains authoritative. The paper's mathematics has not been machine-verified.

## Add another paper

1. Run Paper2Agent/Paper2Skill on the paper and all associated files. Complete source/page/figure review and strict verification. Check reuse rights before publication.
2. Prepare a separate versioned corpus JSON with the `PaperCorpus` contract in `lib/paper-chat.ts`. Preserve exact author text, the paper title/authors/version, sections, named statements, reference mappings, complete proof excerpts when available, and honest page scope. Starting-page links must be checked against the versioned PDF.
3. Put reviewed figure images in `public/papers/<arxiv-id><version>/`. Supply captions, descriptive alt text, original dimensions, SHA-256 hashes, and PDF page links in the corpus. Do not reuse page mappings after changing paper versions.
4. Import the corpus and add one `{ id, corpus }` entry to `PAPER_LIBRARY` in `lib/paper-library.ts`. IDs must be unique and versioned. The selector, figure gallery and search then include the new paper. For non-arXiv material, explicitly adapt the identity/integrity checks and metadata before registering it.
5. Allow the new JSON under the repository's `.gitignore`. Add regression questions for its main statements, definitions, proofs, figures, unrelated questions and mixed-paper ambiguities. Do not silently replace an existing version.
6. Run the checks and repack the website before publishing. Commit the corpus and reviewed figures along with the application and `site-source.zip`.

Mixed-paper answers identify their source papers and use standard TeX to avoid conflicting custom macros. Each displayed source renders with its own paper's notation. The current library has one paper; adding papers is a reviewed publishing workflow, not a visitor upload feature.

## Validation and publication

Run `pnpm install --frozen-lockfile`, `pnpm exec tsc --noEmit`, the targeted linter, and `pnpm build:pages`. The build includes retrieval, prompt, citation, multi-paper scope, source identity and figure-byte integrity tests alongside the existing site and simulation tests. `pnpm preview:pages` serves the built nested routes and their correct base paths. The Vite development server is useful for code iteration; final nested-route checks must use the production preview.

After all edits, run `python3 tools/package-site.py` at the repository root, then `python3 tools/package-site.py --check`. Include the reproducible `site-source.zip` in the same release. The main-branch GitHub Actions workflow runs all manuscript conservation and publication checks before deploying. Preserve all existing Laboratory experiments.
