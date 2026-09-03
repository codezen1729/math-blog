# S. Viswanathan — blog writing

[My website](https://codezen1729.github.io/math-blog/)

## Editing in Overleaf

1. Open the numbered `.tex` file for the post you want to edit. Each is a complete, independently compilable document.
2. Edit the writing between `% BLOG-CONTENT-BEGIN` and `% BLOG-CONTENT-END`. Keep those two marker lines: the website reads the content between them.
3. Click **Recompile** for a PDF preview. If Overleaf shows a different post, select your post under **Settings → Compiler → Main document**, or change the filename in `main.tex`.
4. When ready to make your changes public, choose **Integrations → GitHub → Push Overleaf changes to GitHub**.
5. GitHub checks the LaTeX and rebuilds the website. A failed build leaves the last successful website online. Publishing progress is in the repository’s **Actions** tab.

Recompile does not publish. GitHub sync requires an active Premium entitlement. Keep this Overleaf project owner-only if you want only yourself to publish; collaborators can use its GitHub sync button too.

The PDF is a writing preview; the website keeps its own typography and layout. Original manuscript files and the withdrawn Research Statement are not included.

## Project contents

- Numbered `.tex` files: the 82 editable blog posts.
- `main.tex`: the default preview selection.
- `styles/`: PDF formatting and notation.
- `figures/`: the figures used in the selected posts.
- `tools/`: website conversion and checks; normally leave these alone.
- `site-source.zip`: the website application, not a manuscript. Leave it unchanged in Overleaf.
- `notes-source.zip`: the approved new-post import; it is applied only once and never replaces existing manuscripts.
- `three-notes-source.zip`: the subsequent four-post import; it is also applied only once and never replaces existing manuscripts.
- `overleaf-source.zip`: the initial migration backup. Once the numbered files exist, the build never reapplies this archive.

Changes pushed to this public repository, including their history, are public. Drafts kept only in Overleaf are not published until pushed. Pull GitHub changes before editing if the website was updated elsewhere.

Equation and theorem labels retain the numbering from the source manuscripts; they are not automatically renumbered between posts. For new notation, put definitions in the post body so both converters see them. Dependencies and bundled figures/fonts retain their existing rights and licences.

Existing external figure files are protected by a source-hash check. Changing an uploaded PDF/PNG/JPEG requires re-exporting its matching website figure; the build stops rather than publishing a stale illustration. Inline TikZ diagrams in the posts are rebuilt automatically.
