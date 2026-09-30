# Figure and presentation release audit — 30 September 2026

Status: local verification completed; approved for GitHub publication. The online Overleaf project still shows a restricted/sign-in screen, so online synchronization is not yet verified.

## Coverage

Three independent figure reviewers inspected every currently used figure on 29 contact sheets, checked its surrounding article context, and inspected crowded or questionable assets at full size. Coverage is 335 distinct figures across 337 article placements. Unused legacy assets are not included. This is an exhaustive visual/context review, not a certification of every mathematical proof.

| Series | Distinct figures | Placements |
| --- | ---: | ---: |
| Standard Tools in Complex Analysis | 43 | 43 |
| Surfaces and Curves | 46 | 46 |
| K-theory | 26 | 26 |
| Complex Dynamics | 131 | 131 |
| Commutative Algebra | 10 | 10 |
| Ergodic Theory | 6 | 6 |
| Lemma Book (Olympiad Days) | 54 | 56 |
| Miscellaneous | 19 | 19 |
| Total | 335 | 337 |

The three exhaustive path/context manifests are in the working audit directory `work/figure-audit-20260930/{analysis_surfaces,dynamics,other_series}/inventory.json`; the groups cover 89, 131 and 115 distinct figures respectively. The latter group additionally has a per-image `coverage.json`. Each group has a readable findings report and inspection images.

## Three diagram corrections

1. **Ergodic-theory comparison:** in `figures/ergodic-theory/lecture3-fig-01.pdf` and its website SVG, the lower-left formula now reads `\bigcup_{n\geq0}T^{-n}(B)=X` instead of `T^{-n}(B)=X`. The missing union is already present in the immediately following mathematical text in post 53. Only one TikZ source line changed; prose, box positions, colors and other formulas are retained. Editable source: [lecture3-fig-01.tex](../../figure-sources/ergodic-theory/lecture3-fig-01.tex).
2. **Cone arrows:** in `figures/miscellaneous/m1-fig-06.pdf` and its website SVG, the five dashed green arrows now point from `C` to `chi(i)`, not from `chi(i)` to `C`. This matches the `Cone(chi)` label, existing definition and preceding cone diagrams in post 58. One foreach body changed from `(a\n)--(c)` to `(c)--(a\n)`; all blue arrows, labels, coordinates and colors are retained. Editable source: [m1-fig-06.tex](../../figure-sources/miscellaneous/m1-fig-06.tex).
3. **Gluing-annulus contrast:** the inline TikZ in [24-surgical-tools.tex](../../24-surgical-tools.tex) now uses `gray!15` instead of `gray` and a `0.7pt` line width instead of the thinner default. The lighter background and stronger strokes improve contrast without changing regions, map labels, arrows, formulas or geometry. The website diagram is regenerated from this source, not patched independently.

For the first two, original editable TikZ was copied from the author's source folders; the originals were left untouched. Both rebuilt PDFs and outlined SVGs were individually inspected for complete labels, visible arrowheads and absence of clipping. No AI redraw, invented geometry, global recoloring or raster upscaling was used.

## Placement and presentation changes

- Moved the complete Bloch nested-disks figure block in post 11 immediately before the unrelated final navigation remark.
- Moved the complete branch-cut/crossings figure `note8-fig-03` in post 12 from the later covering-map material to the argument it illustrates: after the crossings proof and before its concluding remark.
- Moved intact `ms-fig-31` from post 84 to its evidenced original location in post 80, immediately after `ms-fig-30`, in the buried-components/Zoretti discussion. It is an auxiliary Julia-set schematic, not a picture of the later Cantor-circles proposition.
- Restored equal-panel presentation for the original three-image Julia gallery and separate three-image multibrot gallery. Panels retain order, aspect ratio and enlargement links; they stack on narrow screens. The shared gallery helper refuses to regroup authored captions, anchors or extra content.
- Static pages and the interactive site now use the same figure-width calculation, dimensions, descriptions, horizontal-scroll wrappers and gallery preparation. Stale inline sizing is replaced consistently; tall diagrams retain their aspect ratios. Phone alignment and scrollable vector presentation no longer depend on whether JavaScript has hydrated the page. Vector diagrams can remain readable without forcing the entire page sideways; raster images are not enlarged beyond their available pixel dimensions.

## Authorship and deliberate non-changes

The release also retains the **separately authorized restoration of the author's exact September 4 version of “The Complex Plane.”** This is an author-version selection, not new editorial rewriting: it contains the non-Euclidean doubling-map remark and ends after the dihedral-group proof. The archived source is [basis-fixing-reduction-2026-09-04.tex](../editorial-author-versions/basis-fixing-reduction-2026-09-04.tex), with provenance and approval recorded in the editorial ledger.

Apart from that independently approved restoration, all other prose remains unchanged by this figure audit. No proof or mathematical passage was shortened or removed. The three figure relocations preserve their complete blocks and passage markers. Mathematical illustration changes are limited to the two explicit text-matching corrections above; the annulus change is visual only.

- The universal-line-bundle raster remains intrinsically soft. Its original 2048-by-1152 JPEG is byte-identical across the available manuscript, repository and Overleaf export; no sharper local source exists. It was not reconstructed into fictitious detail.
- The Lemma Book orthocenter/incenter illustration `lb2-fig-13` remains unchanged: the original source describes scaled pieces and reassembly, so its incenter may belong to an intermediate transformed triangle. The ambiguous geometric interpretation does not justify a speculative alteration.
- The Lemma Book 2012/2014 iteration-index discrepancy remains unchanged because the manuscript already explicitly discloses it.
- Meaningful color distinctions, source palettes and mathematical labels are retained. Removed chatbox functionality and the reverted third laboratory simulation are outside this audit and were not restored.

## Rebuild instructions

The annulus is inline TikZ and follows the normal manuscript-rendering pipeline. The two independent corrected figures can be rebuilt from the repository root with an installed TeX distribution providing `standalone`, `newtxtext`, `newtxmath`, TikZ and `dvisvgm`:

```sh
figure_build_dir="$(mktemp -d)"
for figure_source in figure-sources/ergodic-theory/lecture3-fig-01.tex figure-sources/miscellaneous/m1-fig-06.tex; do
  figure_name="${figure_source##*/}"
  figure_name="${figure_name%.tex}"
  pdflatex -no-shell-escape -interaction=nonstopmode -halt-on-error \
    -output-directory="$figure_build_dir" "$figure_source"
  latex -no-shell-escape -interaction=nonstopmode -halt-on-error \
    -jobname="$figure_name" -output-directory="$figure_build_dir" \
    "\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\\input{$figure_source}"
  dvisvgm --no-fonts --bbox=papersize --exact-bbox --embed-bitmaps --precision=6 \
    --output="$figure_build_dir/$figure_name.svg" "$figure_build_dir/$figure_name.dvi"
done
```

The native DVI SVG driver avoids a Ghostscript-dependent PDF conversion and outlines the font glyphs. Inspect the PDF/SVG results before copying them to their matching `figures/<series>/` and `website/public/figures/<series>/` paths. Update only the corresponding validated PDF hashes in `tools/figure-hashes.json`; do not regenerate the historical editorial baseline. Run the normal manuscript renderer, SVG tightening and `website` `build:pages` pipeline, including gallery, presentation and static-output tests. Regenerate and verify `site-source.zip` before release.

## Final pre-publication verification

- All 84 posts render; all 335 distinct figures and 337 placements remain present.
- All 296 source-figure hashes match their verified inputs; only the two explicitly corrected external PDFs changed.
- 79 application tests, 11 static-output tests, 28 manuscript-renderer tests, 4 package tests, 16 conservation tests and 14 editorial-review tests pass. TypeScript validation passes.
- The public conservation gate passes for 84 posts and 2,069 passages with release approval bound to the exact source set and ledger. The historical baseline was not rewritten.
- 78 manuscripts remain byte-for-byte unchanged. For the five figure-only manuscript edits, removing figure blocks and invisible passage markers yields identical prose and non-figure mathematics before and after. The sixth changed manuscript is the separately approved author-version restoration of The Complex Plane.
- Desktop gallery inspection confirms equal-width panels and intact enlargement links. Because the browser viewport-override capability did not take effect, narrow-screen review used same-origin article frames with real 390-pixel layout viewports. The phone previews show stacked galleries, horizontally scrollable wide figures and a working enlargement dialog at 100% and 125%. This is browser responsive-layout testing, not a claim of testing physical phones or every browser engine.
- The deterministic website package contains 552 files and passes its freshness check. Temporary review frames are excluded from the release package.

Publication/deployment and the actual online Overleaf contents must still be verified after pushing. Local source agreement alone must not be described as a verified online sync.
