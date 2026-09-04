# The Iteration Café — blog writing

[My website](https://codezen1729.github.io/math-blog/)

## Editing in Overleaf

1. Open the numbered `.tex` file for the post you want to edit. Each is a complete, independently compilable document.
2. To rename it, change the single `\section*{Post title}` line above `% BLOG-CONTENT-BEGIN`. Use ordinary title text rather than a displayed formula. That line is the title used in the blog index, search results, article page, navigation, and browser metadata. You do not need to edit either JSON file in `tools/`, and changing a title does not change the post's stable web address.
3. Edit the writing between `% BLOG-CONTENT-BEGIN` and `% BLOG-CONTENT-END`. Keep both marker lines: the website reads the content between them.
4. Click **Recompile** for a PDF preview. If Overleaf shows a different post, select your post under **Settings → Compiler → Main document**, or change the filename in `main.tex`.
5. When ready to make your changes public, choose **Integrations → GitHub → Push Overleaf changes to GitHub**.
6. GitHub checks the LaTeX and rebuilds the website. A failed build leaves the last successful website online. Publishing progress is in the repository’s **Actions** tab.

Recompile does not publish. GitHub sync requires an active Premium entitlement. Keep this Overleaf project owner-only if you want only yourself to publish; collaborators can use its GitHub sync button too.

The PDF is a writing preview; the website keeps its own typography and layout. Original manuscript files and the withdrawn Research Statement are not included.

## Shared typesetting and links

Every numbered post loads `styles/blog-preamble.tex`. It supplies the common AMS mathematics and theorem environments, notation commands, colours, figures, captions, TikZ diagrams, plots, and hyperlink support. Put improvements that should apply to every PDF in that shared preamble; do not copy a long list of `\usepackage` or `\newtheorem` declarations into each post.

To link naturally to another entry in both the PDF preview and the website, write

```tex
\BlogPost{complex-differentiation}{Complex Differentiation}
```

The first argument is the destination's stable slug—the part after `#/post/` in its web address—and the second is the visible wording. The publishing check rejects an unknown slug or a blank label instead of creating a broken link. Ordinary external links continue to use `\href{https://example.org}{visible wording}`.

## Project contents

- Numbered `.tex` files: the 84 editable blog posts.
- `main.tex`: the default preview selection.
- `styles/`: PDF formatting and notation.
- `figures/`: the figures used in the posts.
- `tools/`: website conversion and checks; normally leave these alone.
- `site-source.zip`: the website application, not a manuscript. Leave it unchanged in Overleaf.
- `notes-source.zip`: the approved new-post import; it is applied only once and never replaces existing manuscripts.
- `three-notes-source.zip`: the subsequent four-post import; it is also applied only once and never replaces existing manuscripts.
- `content-revision.zip`: the full-content restoration. It is applied once, after checking that every file being updated still matches the version used to prepare the revision. Later edits are not overwritten by this archive.
- `overleaf-source.zip`: the initial migration backup. Once the numbered files exist, the build never reapplies this archive.

Changes pushed to this public repository, including their history, are public. Drafts kept only in Overleaf are not published until pushed. Pull GitHub changes before editing if the website was updated elsewhere.

The numbered posts include the mathematical content of the supplied `main.tex` documents and the chapters they load. `handout-style.tex` is formatting, not post content. Original Lemma Book lemmas 27–34 remain excluded. Unfinished passages already present in the supplied sources remain as written; no replacement proofs were added.

Equation and theorem labels retain the numbering from the source manuscripts; they are not automatically renumbered between posts. References and citations link to their exact destinations in the blog. For new notation, put definitions in the post body so both converters see them. Dependencies and bundled figures/fonts retain their existing rights and licences.

Existing external figure files are protected by a source-hash check. Changing an uploaded PDF/PNG/JPEG requires re-exporting its matching website figure; the build stops rather than publishing a stale illustration. Inline TikZ diagrams in the posts are rebuilt automatically.
