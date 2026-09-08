# Final compliance review

The author requested a further check and publication, followed by a specific check for any further edits required by the editorial contract.

## Further corrections made

- Removed commas separating “we have”, “such that”, “which implies”, and similar expressions from their formulas; corrected a missing article and a few minimal idiomatic slips, principally in *Thermodynamical Formalism and Hausdorff Dimension*.
- Preserved paragraph boundaries around standalone proof-ending squares in the web converter.
- Updated the publication check to accept the corrected punctuation in *Connectedness and Compactness*. Its original opening formula, figure, and application remain required by the check.
- Corrected one misplaced explanation in the editorial ledger for Abel's Theorem 0.3. That passage only lost two unnecessary commas; its mathematical statement did not change.
- Restored the original archived figure captions as fallback accessibility descriptions where the current post has no caption. Current captions and authored alternative text take precedence. The visible figure titles remain removed. The Abel polygon and elliptic-curve descriptions were checked against the supplied original `main.tex` files.
- Corrected section, heading, footnote, and skip-link destinations so the site's shared asset base cannot redirect an article-local link to the front page. Added a static-page regression check for this behaviour.
- Updated old thermodynamical-formalism topic bookmarks to the Ergodic Theory series, matching the author's earlier move. Clarified how the conservation approval gate affects subsequent Overleaf edits.
- Synchronized a stale deployment copy of the figure-size test with the reviewed local test. Packaging now rejects mismatched local/publication test copies; figure preparation also precedes deployment's presentation checks.

These final manuscript corrections do not change a mathematical expression, theorem, hypothesis, quantifier, or proof step. They are included in the passage ledger. The authorial-voice screen and full conservation report remain separate audit records, not mathematical certifications.

## Mathematical questions retained for the author

The following pre-existing statements were noticed on the final reading. The proposed corrections below have **not** been inserted into the blog: they change mathematical statements and require the author's review under the editorial contract.

### Thermodynamical Formalism and Hausdorff Dimension — Poincaré recurrence

Passages `p0006`–`p0007` state that the intersection of the orbit **as a set of points** with a positive-measure set is infinite almost everywhere. A periodic orbit can return infinitely many times while visiting only finitely many distinct points. For example, the identity transformation on a one-point probability space contradicts the displayed cardinality statement.

Proposed change for author review: count return **times**, `|{n ≥ 1 : T^{∘n}(x) ∈ B}| = ∞`, rather than distinct orbit points. The author's *Recurrence and Three Views of Ergodicity* already phrases recurrence in terms of infinitely many values of `n`.

### Thermodynamical Formalism and Hausdorff Dimension — Birkhoff's theorem

Passages `p0022`–`p0023` state convergence “pointwise” without the almost-everywhere qualification. The author's *Mean, Maximal, and Pointwise Ergodic Theorems* includes that qualification explicitly.

Proposed change for author review: “pointwise almost everywhere.” The qualification changes the scope of the conclusion, so it has not been added as a punctuation edit.

### Thermodynamical Formalism and Hausdorff Dimension — Jacobian

Passages `p0066`–`p0067` first restrict the change-of-variables identity to sets on which `T` is injective, then say that a Jacobian satisfies it “for all A ⊂ X.” Clarify whether “the above” is intended to retain both measurability and injectivity. Literal application to all measurable sets is not valid for a map with overlapping sheets; the restriction matters.

Proposed clarification for author review: retain the relevant measurable-set and injectivity conditions while removing the exceptional null set. No revised definition has been substituted.

The existing proof-integrity report also retains its explicit unfinished arguments and question-mark calculations. None has been filled in from another author's work or deleted to make the blog look finished.

## Scope of preservation

The conservation check compares all 84 posts and 2,080 passages with the frozen authoritative blog version. It verifies passage accounting and protected-payload differences. It does not certify every mathematical assertion or prove that an older manuscript had no material omitted before that baseline was frozen.
